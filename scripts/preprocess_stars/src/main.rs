//! Preprocess star catalogs to binary format.
//!
//! Supports:
//! - Yale Bright Star Catalog (bsc5.dat) - ~9k stars
//! - Hipparcos Catalog (hip_main.dat) - ~118k stars
//!
//! Usage:
//!   preprocess_stars <input.dat> <output.bin> [--hipparcos]
//!
//! The format is auto-detected, or use --hipparcos flag to force.

use std::env;
use std::fs::File;
use std::io::{BufRead, BufReader, Write};
use std::f64::consts::PI;

#[derive(Debug)]
struct Star {
    id: u32,       // HR number (BSC) or HIP number (Hipparcos)
    ra_rad: f32,
    dec_rad: f32,
    vmag: f32,
    bv: f32,
}

fn parse_f64(s: &str) -> Option<f64> {
    s.trim().parse().ok()
}

fn parse_u32(s: &str) -> Option<u32> {
    s.trim().parse().ok()
}

/// Parse Yale BSC fixed-width format
fn parse_bsc_line(line: &str) -> Option<Star> {
    if line.len() < 114 {
        return None;
    }

    let id = parse_u32(&line[0..4])?;

    // RA (columns 76-83): HH MM SS.S
    let ra_h = parse_f64(&line[75..77])?;
    let ra_m = parse_f64(&line[77..79])?;
    let ra_s = parse_f64(&line[79..83])?;
    let ra_hours = ra_h + ra_m / 60.0 + ra_s / 3600.0;
    let ra_rad = (ra_hours * PI / 12.0) as f32;

    // Dec (columns 84-90): +/-DD MM SS
    let dec_sign = if &line[83..84] == "-" { -1.0 } else { 1.0 };
    let dec_d = parse_f64(&line[84..86])?;
    let dec_m = parse_f64(&line[86..88])?;
    let dec_s = parse_f64(&line[88..90])?;
    let dec_deg = dec_sign * (dec_d + dec_m / 60.0 + dec_s / 3600.0);
    let dec_rad = (dec_deg * PI / 180.0) as f32;

    let vmag = parse_f64(&line[102..107])? as f32;
    let bv = parse_f64(&line[109..114]).unwrap_or(0.0) as f32;

    Some(Star { id, ra_rad, dec_rad, vmag, bv })
}

/// Parse Hipparcos pipe-delimited format
/// Fields: H|HIP|...|...|mag|...|...|RA_deg|Dec_deg|...|...|...|...|...|...|...|...|...|...|...|...|...|...|...|...|...|...|...|...|...|...|...|...|...|...|B-V|...
fn parse_hipparcos_line(line: &str) -> Option<Star> {
    if line.len() < 100 || !line.starts_with('H') {
        return None;
    }

    let fields: Vec<&str> = line.split('|').collect();
    if fields.len() < 38 {
        return None;
    }

    // Field 1: HIP number
    let id = parse_u32(fields[1])?;

    // Field 5: Visual magnitude
    let vmag = parse_f64(fields[5])? as f32;

    // Field 8: RA in decimal degrees
    let ra_deg = parse_f64(fields[8])?;
    let ra_rad = (ra_deg * PI / 180.0) as f32;

    // Field 9: Dec in decimal degrees
    let dec_deg = parse_f64(fields[9])?;
    let dec_rad = (dec_deg * PI / 180.0) as f32;

    // Field 37: B-V color index (may be empty)
    let bv = parse_f64(fields[37]).unwrap_or(0.65) as f32; // Default to G-type star color

    Some(Star { id, ra_rad, dec_rad, vmag, bv })
}

/// Detect catalog format from first line
fn detect_format(first_line: &str) -> &'static str {
    if first_line.starts_with('H') && first_line.contains('|') {
        "hipparcos"
    } else {
        "bsc"
    }
}

fn main() {
    let args: Vec<String> = env::args().collect();

    if args.len() < 3 {
        eprintln!("Usage: {} <input.dat> <output.bin> [--hipparcos]", args[0]);
        eprintln!();
        eprintln!("Supported catalogs:");
        eprintln!("  Yale BSC (bsc5.dat):");
        eprintln!("    curl -O http://tdc-www.harvard.edu/catalogs/bsc5.dat.gz && gunzip bsc5.dat.gz");
        eprintln!();
        eprintln!("  Hipparcos (hip_main.dat):");
        eprintln!("    curl -O https://cdsarc.cds.unistra.fr/ftp/cats/I/239/hip_main.dat");
        std::process::exit(1);
    }

    let input_path = &args[1];
    let output_path = &args[2];
    let force_hipparcos = args.iter().any(|a| a == "--hipparcos");

    let file = File::open(input_path).expect("Failed to open input file");
    let reader = BufReader::new(file);
    let lines: Vec<String> = reader.lines().filter_map(|l| l.ok()).collect();

    if lines.is_empty() {
        eprintln!("Empty input file");
        std::process::exit(1);
    }

    // Detect format
    let format = if force_hipparcos {
        "hipparcos"
    } else {
        detect_format(&lines[0])
    };

    println!("Detected format: {}", format);
    println!("Processing {} lines...", lines.len());

    let mut stars: Vec<Star> = Vec::new();
    let mut skipped = 0;

    for line in &lines {
        let star = match format {
            "hipparcos" => parse_hipparcos_line(line),
            _ => parse_bsc_line(line),
        };

        if let Some(s) = star {
            if s.vmag < 15.0 {
                stars.push(s);
            }
        } else {
            skipped += 1;
        }
    }

    println!("Parsed {} stars, skipped {} lines", stars.len(), skipped);

    // Sort by magnitude (brightest first)
    stars.sort_by(|a, b| a.vmag.partial_cmp(&b.vmag).unwrap());

    // Print magnitude distribution
    let mut mag_counts = [0usize; 16];
    for star in &stars {
        let bucket = (star.vmag.max(0.0) as usize).min(15);
        mag_counts[bucket] += 1;
    }
    println!("\nMagnitude distribution:");
    for (mag, count) in mag_counts.iter().enumerate() {
        if *count > 0 {
            println!("  mag {}-{}: {} stars", mag, mag + 1, count);
        }
    }

    // Write binary output
    let mut out = File::create(output_path).expect("Failed to create output file");

    // Header: star count
    out.write_all(&(stars.len() as u32).to_le_bytes())
        .expect("Failed to write header");

    // Per star: ra_rad, dec_rad, vmag, bv, id (20 bytes each)
    for star in &stars {
        out.write_all(&star.ra_rad.to_le_bytes()).unwrap();
        out.write_all(&star.dec_rad.to_le_bytes()).unwrap();
        out.write_all(&star.vmag.to_le_bytes()).unwrap();
        out.write_all(&star.bv.to_le_bytes()).unwrap();
        out.write_all(&star.id.to_le_bytes()).unwrap();
    }

    let file_size = 4 + stars.len() * 20;
    println!("\nWrote {} bytes ({:.1} KB) to {}", file_size, file_size as f64 / 1024.0, output_path);
}

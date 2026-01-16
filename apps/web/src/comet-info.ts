/**
 * Comet information data for the info popup.
 */

export interface CometInfo {
  name: string;
  commonName: string;
  type: string;
  period: string;
  perihelion: string;
  lastVisit: string;
  nextReturn: string;
  description: string;
}

export const COMET_INFO: Record<string, CometInfo> = {
  "1P/Halley": {
    name: "1P/Halley",
    commonName: "Halley's Comet",
    type: "Periodic",
    period: "~76 years",
    perihelion: "0.59 AU",
    lastVisit: "Feb 9, 1986",
    nextReturn: "Jul 28, 2061",
    description: "The most famous comet in history, observed for over 2,000 years. Edmond Halley predicted its return in 1705, proving comets follow orbits. In 1986, the Giotto spacecraft flew within 596 km of its nucleus, revealing a potato-shaped body 15 km long."
  },
  "2P/Encke": {
    name: "2P/Encke",
    commonName: "Encke's Comet",
    type: "Periodic",
    period: "3.3 years",
    perihelion: "0.34 AU",
    lastVisit: "Oct 2023",
    nextReturn: "Jan 2027",
    description: "Has the shortest orbital period of any known comet. Named after Johann Franz Encke who calculated its orbit in 1819. The parent body of the Taurid meteor stream, which produces fireballs in October-November."
  },
  "67P/C-G": {
    name: "67P/Churyumov-Gerasimenko",
    commonName: "Comet 67P",
    type: "Periodic",
    period: "6.4 years",
    perihelion: "1.24 AU",
    lastVisit: "Nov 2021",
    nextReturn: "Mar 2028",
    description: "Target of ESA's Rosetta mission, which orbited the comet from 2014-2016. The Philae lander made the first soft landing on a comet in November 2014. Its distinctive duck-shaped nucleus is about 4 km across."
  },
  "46P/Wirtanen": {
    name: "46P/Wirtanen",
    commonName: "Comet Wirtanen",
    type: "Periodic",
    period: "5.4 years",
    perihelion: "1.06 AU",
    lastVisit: "Dec 2018",
    nextReturn: "May 2024",
    description: "In December 2018, it passed within 11.6 million km of Earth—one of the closest comet approaches in centuries. Originally the target for ESA's Rosetta mission before a launch delay forced a target change."
  },
  "C/2020 F3 NEOWISE": {
    name: "C/2020 F3 NEOWISE",
    commonName: "Comet NEOWISE",
    type: "Long-period",
    period: "~6,800 years",
    perihelion: "0.29 AU",
    lastVisit: "Jul 3, 2020",
    nextReturn: "~Year 8800",
    description: "The brightest comet visible from the Northern Hemisphere since Hale-Bopp in 1997. Discovered by NASA's NEOWISE space telescope on March 27, 2020. At peak brightness it reached magnitude 1, visible to the naked eye with a spectacular dual tail."
  },
  "C/2023 A3 T-ATLAS": {
    name: "C/2023 A3 Tsuchinshan-ATLAS",
    commonName: "Comet Tsuchinshan-ATLAS",
    type: "Long-period",
    period: "~26,000 years",
    perihelion: "0.39 AU",
    lastVisit: "Sep 27, 2024",
    nextReturn: "~Year 28000",
    description: "Discovered independently in 2023 by observatories in China (Purple Mountain) and South Africa (ATLAS). Became a spectacular naked-eye comet in October 2024, with early estimates suggesting it could reach magnitude -3."
  },
  "C/1995 O1 Hale-Bopp": {
    name: "C/1995 O1 Hale-Bopp",
    commonName: "Comet Hale-Bopp",
    type: "Long-period",
    period: "~2,533 years",
    perihelion: "0.91 AU",
    lastVisit: "Apr 1, 1997",
    nextReturn: "~Year 4530",
    description: "The 'Great Comet of 1997' was visible to the naked eye for a record 18 months. Independently discovered by Alan Hale and Thomas Bopp in 1995 when it was still beyond Jupiter. Reached magnitude -1.8 at perihelion, brighter than any star except Sirius."
  }
};

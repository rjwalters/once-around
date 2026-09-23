# Check AR alignment on a phone

Open **Check AR alignment with the Moon or Sun** below AR Mode in the app controls (also in About), or visit `/test.html`. The Moon is the default. Tap **Start camera & sensors** and allow rear-camera, motion and location access. Nothing starts automatically.

Use the camera preview to center the visible target on the reticle, then tap **Capture alignment**. For the Sun, use only the preview; never look directly at the Sun. The page refuses captures below the calculated horizon, without a live rear-camera preview, or without usable recent GPS and north-referenced motion data. If motion becomes stale, gently move the phone, then align and capture: browsers may stop reporting while a phone is stationary, so silence does not diagnose a broken compass.

GPS must be less than 30 seconds old with reported accuracy of 100 m or better. Motion uses the same 3-second validity and accepted heading sources as main AR. Expected positions use the current UTC and GPS observer, including lunar parallax. The screen rotation is recorded; the rear-camera axis does not change when the display rotates. Browser-reported heading references and the app's magnetic declination model are recorded so measurements can be interpreted honestly.

The ten most recent captures include expected/measured altitude and azimuth, signed shortest **measured minus expected** differences, great-circle separation, UTC, GPS accuracy and age, motion age/reference/accuracy, screen rotation, raw sensor angles, uncorrected magnetic azimuth, and magnetic declination. Azimuth alone is unstable near the zenith: use great-circle error there. Unknown compass accuracy remains unknown, and reported accuracy does not include all aiming, optical, atmospheric or model uncertainty. A small error does not establish calibration; no correction is applied or saved.

**Copy JSON** or **Download JSON** exports measurements only. GPS coordinates are omitted unless you check **Include GPS coordinates**. Images are neither saved nor transmitted; captures are held only in tab memory. Share an export yourself with the phone/browser model and whether you used portrait or landscape. **Stop**, hiding the tab, or leaving the page releases camera, GPS and motion resources. Return via **Return to sky map**.

Automated tests use mocked camera, location and orientation inputs. These do not replace a physical Pixel observation under the real sky.

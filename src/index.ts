import * as puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  try {
    const date = new Date().toISOString().replace(/[:.]/g, '-').split('.')[0];
    const logDir = path.join(__dirname, '..', 'logs', date);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const screenshotsDir = path.join(logDir, 'screenshots');
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    const logFile = path.join(logDir, 'log.txt');
    const logStream = fs.createWriteStream(logFile, { flags: 'a' });

    const log = (message: string) => {
      console.log(message);
      logStream.write(`${new Date().toISOString()} - ${message}\n`);
    };

    // Launch the browser in the new headless mode
    log("Launching browser...");
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox']
    });

    // Create a new page and set the viewport
    log("Creating new page and setting viewport to 1920x1080");
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    // Navigate to the login page
    log("Navigating to login page: https://online.spor.istanbul/uyegiris");
    await page.goto('https://online.spor.istanbul/uyegiris', { waitUntil: 'networkidle2' });
    log("Taking screenshot of login page");
    await page.screenshot({ path: path.join(screenshotsDir, '1-login_page.png'), fullPage: true });

    // Fill in the login form.
    log("Filling in login credentials");
    const tcno = process.env.TCNO;
    const password = process.env.PASSWORD;
    if (!tcno || !password) {
      throw new Error("TCNO or PASSWORD is not defined in .env file!");
    }
    await page.type('input[name="txtTCPasaport"]', tcno, { delay: 100 });
    await page.type('input[name="txtSifre"]', password, { delay: 100 });

    // Click the submit button and wait for navigation
    log("Clicking login button");
    await Promise.all([
      page.click('input[name="btnGirisYap"]'),
      page.waitForNavigation({ waitUntil: 'networkidle2' })
    ]);

    // Save a screenshot after login
    log("Taking screenshot after login");
    await page.screenshot({ path: path.join(screenshotsDir, '2-after_login.png'), fullPage: true });

    // Navigate to the second page and take another screenshot
    log("Navigating to second page: https://online.spor.istanbul/uyespor");
    await page.goto('https://online.spor.istanbul/uyespor', { waitUntil: 'networkidle2' });
    log("Taking screenshot of uyespor page");
    await page.screenshot({ path: path.join(screenshotsDir, '3-uyespor_page.png'), fullPage: true });

    log("Clicking on session selection button");
    await page.evaluate(() => {
      //@ts-ignore
      __doPostBack('ctl00$pageContent$rptListe$ctl00$lbtnSeansSecim','');
    });

    log("Waiting for navigation to session selection page");
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    log("Taking screenshot of session selection page");
    await page.screenshot({ path: path.join(screenshotsDir, '4-session_selection_page.png'), fullPage: true });

    // Once the final page is loaded (the one with appointment listings),
    // find all appointment entries (divs with the "well" class), and for those with
    // a non-zero "Kalan Kontenjan", log their details to the console.
    const availableAppointments = await page.evaluate(() => {
      interface Appointment {
        sessionLevel: string;
        salonName: string;
        time: string;
        gender: string;
        capacity: number;
        day: string;
      }
      const appointmentNodes = Array.from(document.querySelectorAll('div.well'));
      const appointments = appointmentNodes.map(appointment => {
        const capacityElem = appointment.querySelector('span.label-default[title="Kalan Kontenjan"]');
        const capacityText = (capacityElem && capacityElem.textContent) ? capacityElem.textContent.trim() : "0";
        const capacity = parseInt(capacityText) || 0;
        if (capacity > 0) {
          const sessionLevelElem = appointment.querySelector('span[title="Seans Seviyesi"]');
          const salonNameElem = appointment.querySelector('label[title="Salon Adı"]');
          const timeElem = appointment.querySelector('span[id*="lblSeansSaat"]');
          const genderElem = appointment.querySelector('label[title="Seans Cinsiyeti"]');
          const dayElem = appointment.closest('.col-md-1')?.querySelector('.panel-title');
          const sessionLevel = (sessionLevelElem && sessionLevelElem.textContent) ? sessionLevelElem.textContent.trim() : '';
          const salonName = (salonNameElem && salonNameElem.textContent) ? salonNameElem.textContent.trim() : '';
          const time = (timeElem && timeElem.textContent) ? timeElem.textContent.trim() : '';
          const gender = (genderElem && genderElem.textContent) ? genderElem.textContent.trim() : '';
          const day = (dayElem && dayElem.textContent) ? dayElem.textContent.trim().split('\n')[0] : '';

          return {
            sessionLevel,
            salonName,
            time,
            gender,
            capacity,
            day
          };
        }
        return null;
      }).filter(appointment => appointment !== null) as Appointment[];

      return appointments;
    });

    const appointmentsList = availableAppointments.map((app: { sessionLevel: string, salonName: string, time: string, gender: string, capacity: number, day: string }) => {
      return `Day: ${app.day}, Session Level: ${app.sessionLevel}, Salon: ${app.salonName}, Time: ${app.time}, Gender: ${app.gender}, Capacity: ${app.capacity}`;
    }).join('\n');

    if (availableAppointments.length) {
      log("Appointments with available quota found:");
      log(appointmentsList);
    } else {
      log("No appointments with available quota were found.");
    }

    log("Closing browser");
    await browser.close();
    logStream.end();
  } catch (error) {
    console.error('Error during automation:', error);
  }
}

run();
import { Builder, By, until } from 'selenium-webdriver';
import * as chrome from 'selenium-webdriver/chrome';
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

    // Launch Selenium browser (Chrome) in headless mode with custom options
    log("Launching browser...");
    const chromeOptions = new chrome.Options();
    chromeOptions.addArguments("--headless=new", "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--window-size=1920,1080");
    const driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(chromeOptions)
      .build();

    // Navigate to the login page
    log("Navigating to login page: https://online.spor.istanbul/uyegiris");
    await driver.get('https://online.spor.istanbul/uyegiris');
    // Wait for the login button to appear to ensure the page has loaded
    await driver.wait(until.elementLocated(By.css('input[name="btnGirisYap"]')), 10000);

    // Take screenshot of login page
    log("Taking screenshot of login page");
    let screenshot = await driver.takeScreenshot();
    fs.writeFileSync(path.join(screenshotsDir, '1-login_page.png'), screenshot, 'base64');

    // Fill in the login form.
    log("Filling in login credentials");
    const tcno = process.env.TCNO;
    const password = process.env.PASSWORD;
    if (!tcno || !password) {
      throw new Error("TCNO or PASSWORD is not defined in .env file!");
    }

    await driver.findElement(By.css('input[name="txtTCPasaport"]')).sendKeys(tcno);
    await driver.findElement(By.css('input[name="txtSifre"]')).sendKeys(password);

    // Click the submit button and wait for navigation
    log("Clicking login button");
    await driver.findElement(By.css('input[name="btnGirisYap"]')).click();
    
    // Wait until the URL changes from the login page
    await driver.wait(async () => {
      const url = await driver.getCurrentUrl();
      return !url.includes('uyegiris');
    }, 10000);

    // Take screenshot after login
    log("Taking screenshot after login");
    screenshot = await driver.takeScreenshot();
    fs.writeFileSync(path.join(screenshotsDir, '2-after_login.png'), screenshot, 'base64');

    // Navigate to the second page
    log("Navigating to second page: https://online.spor.istanbul/uyespor");
    await driver.get('https://online.spor.istanbul/uyespor');
    // Wait for the page to load; here we simply wait for the body element
    await driver.wait(until.elementLocated(By.css('body')), 10000);

    // Take screenshot of uyespor page
    log("Taking screenshot of uyespor page");
    screenshot = await driver.takeScreenshot();
    fs.writeFileSync(path.join(screenshotsDir, '3-uyespor_page.png'), screenshot, 'base64');

    // Click on session selection button using executeScript to trigger __doPostBack
    log("Redirecting to session selection page");
    await driver.executeScript("__doPostBack('ctl00$pageContent$rptListe$ctl00$lbtnSeansSecim','');");
    
    // Wait for navigation to session selection page
    await driver.wait(until.urlContains('uyeseanssecim'), 10000);
    // Additional sleep to ensure complete loading
    await driver.sleep(2000);

    // Take screenshot of session selection page
    log("Taking screenshot of session selection page");
    screenshot = await driver.takeScreenshot();
    fs.writeFileSync(path.join(screenshotsDir, '4-session_selection_page.png'), screenshot, 'base64');

    // Evaluate and extract available appointments
    const availableAppointments = await driver.executeScript(function() {
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
      }).filter(appointment => appointment !== null);
      return appointments;
    }) as { sessionLevel: string, salonName: string, time: string, gender: string, capacity: number, day: string }[];

    // Format the appointments list for logging
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
    await driver.quit();
    logStream.end();
  } catch (error) {
    console.error('Error during automation:', error);
  }
}

run();
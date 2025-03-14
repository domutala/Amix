import puppeteer from "puppeteer";
import { URL } from "url";
import axios from "axios";
import dayjs from "dayjs";
import { dataSource } from "./database";
import { Href } from "./database/entities/Href";
import { Analyzer } from "./analyzer";

// Interface pour stocker l'URL de base avec la date de première visite et la date de crawl
interface BaseUrl {
  url: string;
  firstVisitDate: string; // Date de première visite
  lastCrawlDate: string; // Date de dernier crawl
}

export class Crawler {
  constructor({
    maxJob,
    intervalBetweenTwoJobs = 2000,
  }: { maxJob?: number; intervalBetweenTwoJobs?: number } = {}) {
    this.maxJob = maxJob || 10;
    this.intervalBetweenTwoJobs = intervalBetweenTwoJobs;

    this.start();
  }

  maxJob = 10;
  intervalBetweenTwoJobs: number;
  repository = dataSource.getRepository(Href);

  async pingPage(href: string) {
    try {
      const response = await axios.head(href);
      return response.status === 200;
    } catch (error) {
      // console.error(`Impossible de pinger ${href}:`, error);
      return false;
    }
  }

  // Fonction pour vérifier si un site peut être crawlé
  async canCrawl(url: string): Promise<boolean> {
    // Vérifier si le site existe
    const pageExists = await this.pingPage(url);
    if (!pageExists) return false;

    try {
      const domain = new URL(url).hostname; // Extraire le domaine à partir de l'URL
      const robotsUrl = `https://${domain}/robots.txt`;

      // Tente de récupérer le fichier robots.txt
      const response = await axios.get(robotsUrl);

      // Si robots.txt existe, vérifier les règles
      const robotsTxt = response.data;

      // Vérifier les directives "Disallow" dans le fichier robots.txt
      const disallowedPaths = robotsTxt
        .split("\n")
        .filter((line: string) => line.startsWith("Disallow"))
        .map((line: string) => line.split(":")[1]?.trim());

      // Si l'URL à crawler correspond à un chemin "Disallow", on ne peut pas le crawler
      for (let disallowedPath of disallowedPaths) {
        if (url.includes(disallowedPath)) {
          console.log(`Le site ${url} interdit ce crawl via robots.txt.`);
          return false;
        }
      }

      return true;
    } catch (error) {
      // console.error(`Impossible de récupérer robots.txt pour ${url}:`, error);
      return true; // Si on ne peut pas récupérer robots.txt, on autorise par défaut
    }
  }

  async scrape(url: string) {
    try {
      // Vérifier si le site peut être crawlé
      if (!(await this.canCrawl(url))) return;

      // Lance un navigateur headless
      const browser = await puppeteer.launch();
      const page = await browser.newPage();

      // Navigue vers l'URL fournie
      await page.goto(url, { waitUntil: "domcontentloaded" });

      // Récupère tous les liens de la page
      const _urls = await page.$$eval(
        "a",
        (anchors, baseUrl) =>
          anchors.map((anchor) => {
            // Convertir les liens relatifs en absolus
            const href = anchor.href;
            return href.startsWith("http") ? href : new URL(href, baseUrl).href;
          }),
        url
      ); // Passe l'URL de base comme argument

      // Filtrer les liens pour éviter les doublons
      const uniqueLinks: string[] = [...new Set(_urls)];

      // Ajoute les liens uniques dans la base de données
      for (let uniqueLink of uniqueLinks) {
        if (uniqueLink.startsWith("http")) {
          let old = await this.repository.findOne({
            where: { url: uniqueLink },
          });
          if (!old) old = new Href();

          old.url = uniqueLink;
          await old.save();
        }
      }

      // Sauvegarde l'URL de base et met à jour la date de crawl
      // this.saveBaseUrl(url);

      // appler une fonction qui va exploiter le contenu du site
      const content = await page.content();
      new Analyzer(url, content);

      // Ferme le navigateur
      browser.close();
    } catch (error) {
      console.log(error);
    }
  }

  /**
   * Sauvegarde l'URL de base des sites trouvés pour la première fois.
   * Si l'URL existe déjà, on met à jour la date de dernier crawl.
   * @param url - L'URL du site à sauvegarder ou mettre à jour
   */
  saveBaseUrl(url: string) {
    // Vérifie si l'URL existe déjà dans la liste
    const existingUrl = BASE_URLS.find((baseUrl) => baseUrl.url === url);

    if (!existingUrl) {
      // Si l'URL n'est pas trouvée, on l'ajoute avec la date actuelle
      BASE_URLS.push({
        url,
        firstVisitDate: new Date().toISOString(),
        lastCrawlDate: new Date().toISOString(), // Date du premier crawl
      });
    } else {
      // Si l'URL existe déjà, on met à jour la date de dernier crawl
      existingUrl.lastCrawlDate = new Date().toISOString();
    }
  }

  // Exemple d'utilisation : extraire les liens de 'https://tarico.io'
  crawlSite(url: string) {
    // vérifier est-ce le site est déjà crawlé
    const existingUrl = BASE_URLS.find((baseUrl) => baseUrl.url === url);

    // if (
    //   existingUrl &&
    //   dayjs().diff(dayjs(existingUrl.lastCrawlDate), "minutes") < 10
    // ) {
    //   return;
    // }

    this.scrape(url);
  }

  async start() {
    const url = TEMPS_HREFS[0];
    if (url) {
      let href = await this.repository.findOne({ where: { url } });
      if (href) {
        href.lastDateCrawled = new Date();
        await href.save();
      }
      const i = TEMPS_HREFS.findIndex((u) => u === url);
      if (i > -1) TEMPS_HREFS.splice(i, 1);

      this.crawlSite(url);
    }

    // Rappeler la fonction pour continuer à crawler indéfiniment
    if (this.maxJob > 0) {
      this.maxJob--;
      setTimeout(() => this.start(), this.intervalBetweenTwoJobs);
    }
  }
}

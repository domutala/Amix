import { dataSource } from "./database";
import { Href } from "./database/entities/Href";
import * as cheerio from "cheerio";

export class Analyzer {
  repository = dataSource.getRepository(Href);

  href: Href;
  $: cheerio.CheerioAPI;

  constructor(href: string, content: string) {
    this.repository.findOne({ where: { url: href } }).then((result) => {
      this.href = result;
      this.init(content);
    });
  }

  async init(content: string) {
    try {
      this.$ = cheerio.load(content);

      await this.getTitle();
      await this.getLanguage();

      await this.href.save();
      //   await browser.close();
    } catch (error) {
      console.error(error);
    }
  }

  /** Récupère le titre de la page */
  async getTitle() {
    const title = this.$("title").text();
    this.href.title = title;
  }

  /** Récupére la langue du site */
  async getLanguage() {
    const lang = this.$("html")?.attr()?.lang;
    this.href.lang = lang;
  }
}

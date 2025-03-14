import { Crawler } from "./crawler";
import { dataSource, initDatabase } from "./database";
import { Href } from "./database/entities/Href";

await initDatabase();

async function hrefFiller() {
  const repository = dataSource.getRepository(Href);

  function watchArray<T>(
    arr: T[],
    callback: (action: "push" | "splice", args: any[], removed?: T[]) => void
  ): T[] {
    return new Proxy(arr, {
      get(target, prop: string, receiver) {
        const value = Reflect.get(target, prop, receiver);

        if (prop === "push") {
          return (...args: T[]) => {
            const result = Reflect.apply(target.push, target, args);
            callback("push", args);
            return result;
          };
        }
        if (prop === "splice") {
          return (start: number, deleteCount?: number, ...items: T[]) => {
            const removed = target.slice(start, start + (deleteCount ?? 0));
            const result = Reflect.apply(target.splice, target, [
              start,
              deleteCount,
              ...items,
            ]);
            callback("splice", [start, deleteCount, ...items], removed);
            return result;
          };
        }

        return value;
      },
    });
  }

  // Exemple d'utilisation
  global.TEMPS_HREFS = watchArray<string>([], (action, args, removed) => {
    // quand un url est supprimé, le remplacer par un autre dans la base
    if (action === "splice") {
      repository
        .createQueryBuilder("href")
        .where(
          "href.lastDateCrawled IS NULL OR href.lastDateCrawled < NOW() - INTERVAL '10 minutes'"
        )
        .getOne()
        .then((href) => {
          if (href) TEMPS_HREFS.push(href.url);
        });
    }
  });

  const hrefs = await repository
    .createQueryBuilder("href")
    .where(
      "href.lastDateCrawled IS NULL OR href.lastDateCrawled < NOW() - INTERVAL '10 minutes'"
    )
    .orderBy('"updatedAt"', "ASC")
    .limit(5)
    .getMany();

  TEMPS_HREFS.push(...hrefs.map((href) => href.url));
}

await hrefFiller();

new Crawler();

import { Column, Entity } from "typeorm";
import { Base } from "./Base";

@Entity()
export class Href extends Base {
  @Column({ type: "varchar" })
  url: string;

  @Column({ type: "timestamp", nullable: true })
  lastDateCrawled: Date;

  @Column({ type: "text", nullable: true })
  title: string;

  @Column({ type: "text", nullable: true })
  lang: string;
}

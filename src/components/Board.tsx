import { ArrowRight, ArrowUpRight } from "lucide-react";
import { memo } from "react";
import type { Board as BoardData, Link } from "../../shared/types.ts";
import { linkIconSrc } from "../api.ts";
import { groupBoard } from "../lib/board.ts";
import { estimateCategoryHeight } from "../lib/columns.ts";
import { CategorySection, Columns } from "./Layout.tsx";
import { LinkIcon } from "./LinkIcon.tsx";

const LinkCard = memo(function LinkCard({ link }: { link: Link }) {
  return (
    <a
      className="link-card"
      href={link.url}
      target={link.newTab ? "_blank" : undefined}
      rel={link.newTab ? "noopener noreferrer" : undefined}
    >
      <LinkIcon src={linkIconSrc(link)} />
      <span className="link-name">{link.name}</span>
      {link.newTab ? (
        <ArrowUpRight className="link-go" aria-hidden="true" />
      ) : (
        <ArrowRight className="link-go" aria-hidden="true" />
      )}
    </a>
  );
});

/** The board outside edit mode: plain links, with empty categories left out. */
export function Board({ board }: { board: BoardData }) {
  const { ungrouped, groups } = groupBoard(board);
  const visible = groups.filter((group) => group.links.length > 0);

  return (
    <div className="board">
      {ungrouped.length > 0 && (
        <ul className="link-grid">
          {ungrouped.map((link) => (
            <li key={link.id}>
              <LinkCard link={link} />
            </li>
          ))}
        </ul>
      )}
      <Columns
        items={visible}
        keyOf={(group) => group.category.id}
        heightOf={(group) => estimateCategoryHeight(group.links.length)}
        render={(group, index) => (
          <CategorySection name={group.category.name} index={index}>
            <ul className="link-list">
              {group.links.map((link) => (
                <li key={link.id}>
                  <LinkCard link={link} />
                </li>
              ))}
            </ul>
          </CategorySection>
        )}
      />
    </div>
  );
}

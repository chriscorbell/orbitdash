import {
  type CSSProperties,
  Fragment,
  type ReactNode,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { columnCountForWidth, distributeIntoColumns } from "../lib/columns.ts";

interface ColumnsProps<T> {
  items: readonly T[];
  keyOf: (item: T) => string;
  heightOf: (item: T) => number;
  render: (item: T, index: number) => ReactNode;
}

/** Categories dealt into balanced columns, as many as the width allows. */
export function Columns<T>({ items, keyOf, heightOf, render }: ColumnsProps<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(3);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setCount(columnCountForWidth(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const order = new Map(items.map((item, index) => [item, index]));
  const columns = distributeIntoColumns(items, count, heightOf);

  return (
    <div
      ref={ref}
      className="columns"
      data-single={count === 1 || undefined}
      style={{ "--columns": count } as CSSProperties}
    >
      {columns.map((column, index) => (
        <div className="column" key={index}>
          {column.map((item) => (
            <Fragment key={keyOf(item)}>{render(item, order.get(item)!)}</Fragment>
          ))}
        </div>
      ))}
    </div>
  );
}

interface CategoryProps {
  name: string;
  /** Position on the page, for staggering the entrance. */
  index: number;
  actions?: ReactNode;
  children: ReactNode;
}

export function CategorySection({ name, index, actions, children }: CategoryProps) {
  return (
    <section className="category" style={{ "--i": index } as CSSProperties}>
      <header className="category-header">
        <h2 className="category-name">{name}</h2>
        {actions}
      </header>
      {children}
    </section>
  );
}

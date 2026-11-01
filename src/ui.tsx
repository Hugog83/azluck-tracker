import { Crosshair } from "lucide-react";
export function PageTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">AZLUCK / MODERN WARFARE 4</div>
        <h1>
          {title}
          <span>.</span>
        </h1>
        <p>{description}</p>
      </div>
    </div>
  );
}
export function Empty({ text, sub }: { text: string; sub?: string }) {
  return (
    <div className="empty">
      <Crosshair size={28} />
      <strong>{text}</strong>
      {sub && <span>{sub}</span>}
    </div>
  );
}

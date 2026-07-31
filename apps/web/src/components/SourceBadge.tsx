export default function SourceBadge({ name, url }: { name: string; url: string | null }) {
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">
      {name}
    </a>
  ) : (
    <span className="text-xs text-gray-500">{name}</span>
  );
}

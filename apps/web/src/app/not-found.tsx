import Link from "next/link";

export default function NotFound() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-10 text-center">
      <h1 className="text-2xl font-bold">ページが見つかりません</h1>
      <Link href="/" className="mt-4 inline-block text-blue-600 underline">
        トップへ戻る
      </Link>
    </div>
  );
}

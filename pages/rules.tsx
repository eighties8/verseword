import Head from "next/head";

export default function RulesPage() {
  const year = new Date().getFullYear();
  return (
    <div className="container mx-auto max-w-3xl px-6 py-10">
      <Head>
        <title>How to Play</title>
        <meta name="robots" content="index,follow" />
      </Head>
      <h1 className="text-3xl mb-6">How to Play</h1>
      <div className="prose prose-gray max-w-none">
        <ul>
          <li>Guess the hidden word in a limited number of tries.</li>
          <li>Letters change color to indicate accuracy.</li>
          <li>Toggle “Verse Hint” to see a related Bible reference for guidance.</li>
          <li>New puzzle appears once per day at midnight (your local time).</li>
          <li>No spoilers: please avoid posting answers publicly the same day.</li>
        </ul>
      </div>
      <div className="mt-12 text-center text-gray-500 text-sm">© {year} Red Mountain Media LLC. All rights reserved.</div>
    </div>
  );
}



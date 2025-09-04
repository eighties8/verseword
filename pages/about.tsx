import Head from "next/head";

export default function AboutPage() {
  const year = new Date().getFullYear();
  return (
    <div className="container mx-auto max-w-3xl px-6 py-10">
      <Head>
        <title>About Verseword</title>
        <meta name="robots" content="index,follow" />
      </Head>
      <h1 className="text-3xl mb-6">About Verseword</h1>
      <div className="prose prose-gray max-w-none">
        <p>
          Verseword is a daily, Bible-inspired word puzzle designed for quick play on mobile and desktop. Our goal is to encourage daily engagement with Scripture through approachable word challenges and optional verse hints. We are independent and not affiliated with any denomination or publisher.
        </p>
      </div>
      <div className="mt-12 text-center text-gray-500 text-sm">© {year} Red Mountain Media LLC. All rights reserved.</div>
    </div>
  );
}



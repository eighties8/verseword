import Head from "next/head";

export default function ContactPage() {
  const year = new Date().getFullYear();
  return (
    <div className="container mx-auto max-w-3xl px-6 py-10">
      <Head>
        <title>Contact</title>
        <meta name="robots" content="index,follow" />
      </Head>
      <h1 className="text-3xl mb-6">Contact</h1>
      <div className="prose prose-gray max-w-none">
        <p>
          We&apos;d love to hear from you—bug reports, suggestions, and collaboration ideas are welcome.
        </p>
        <ul>
          <li>Email: support@verseword.com</li>
          <li>X/Twitter: @versewordgame</li>
        </ul>
        <p>We typically respond within 2-3 business days.</p>
      </div>
      <div className="mt-12 text-center text-gray-500 text-sm">© {year} Red Mountain Media LLC. All rights reserved.</div>
    </div>
  );
}



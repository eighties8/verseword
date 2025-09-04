import Head from "next/head";

export default function TermsPage() {
  const year = new Date().getFullYear();
  return (
    <div className="container mx-auto max-w-3xl px-6 py-10">
      <Head>
        <title>Terms of Service</title>
        <meta name="robots" content="index,follow" />
      </Head>
      <h1 className="text-3xl mb-6">Terms of Service</h1>
      <div className="prose prose-gray max-w-none space-y-6">
        <section>
          <h2 className="text-xl mb-2">Acceptance</h2>
          <p>By accessing or using verseword.com (“Service”), you agree to these Terms.</p>
        </section>
        <section>
          <h2 className="text-xl mb-2">Use of the Service</h2>
          <p>Do not misuse the Service, interfere with others&apos; use, or attempt to access non-public areas. We may modify or discontinue features at any time.</p>
        </section>
        <section>
          <h2 className="text-xl mb-2">Intellectual Property</h2>
          <p>All site content (including UI, text, and assets) is owned by Verseword or its licensors. You may not copy, resell, or commercialize the Service without permission.</p>
        </section>
        <section>
          <h2 className="text-xl mb-2">User Content</h2>
          <p>If you submit feedback, you grant us a non-exclusive, royalty-free license to use it to improve the Service.</p>
        </section>
        <section>
          <h2 className="text-xl mb-2">No Warranties</h2>
          <p>The Service is provided “as is” without warranties of any kind.</p>
        </section>
        <section>
          <h2 className="text-xl mb-2">Limitation of Liability</h2>
          <p>To the fullest extent permitted by law, Verseword is not liable for indirect, incidental, or consequential damages.</p>
        </section>
        <section>
          <h2 className="text-xl mb-2">Governing Law</h2>
          <p>These Terms are governed by the laws applicable in your place of residence unless required otherwise by local law.</p>
        </section>
        <section>
          <h2 className="text-xl mb-2">Contact</h2>
          <p>support@verseword.com</p>
        </section>
      </div>
      <div className="mt-12 text-center text-gray-500 text-sm">© {year} Red Mountain Media LLC. All rights reserved.</div>
    </div>
  );
}



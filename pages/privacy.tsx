import Head from "next/head";

export default function PrivacyPage() {
  const year = new Date().getFullYear();
  return (
    <div className="container mx-auto max-w-3xl px-6 py-10">
      <Head>
        <title>Privacy Policy</title>
        <meta name="robots" content="index,follow" />
      </Head>
      <h1 className="text-3xl mb-6">Privacy Policy</h1>
      <div className="prose prose-gray max-w-none space-y-6">
        <section>
          <h2 className="text-xl mb-2">Introduction</h2>
          <p>
            This Privacy Policy explains how Verseword (“we,” “our,” “us”) collects, uses, and shares information when you use verseword.com.
          </p>
        </section>

        <section>
          <h2 className="text-xl mb-2">What We Collect</h2>
          <ul>
            <li>Usage data (pages viewed, device/browser info) via analytics and server logs.</li>
            <li>Cookies/localStorage for preferences (e.g., theme, progress).</li>
            <li>If you contact us, we receive your email and any info you provide.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl mb-2">Cookies &amp; Similar Technologies</h2>
          <p>
            We use cookies to operate the site, remember settings, measure performance, and (if enabled) show ads.
          </p>
        </section>

        <section>
          <h2 className="text-xl mb-2">Advertising (Google AdSense)</h2>
          <p>
            We may use Google AdSense. Google and its partners may use cookies to serve ads based on your visits to this and other sites.
          </p>
          <ul>
            <li>Learn more / opt-out: https://policies.google.com/technologies/ads and https://adssettings.google.com</li>
            <li>Google&apos;s Privacy &amp; Terms: https://policies.google.com/privacy</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl mb-2">Analytics</h2>
          <p>
            We may use privacy-minded analytics. Data is aggregated and used to improve the experience.
          </p>
        </section>

        <section>
          <h2 className="text-xl mb-2">Children&apos;s Privacy</h2>
          <p>
            Verseword is intended for general audiences and not directed to children under 13.
          </p>
        </section>

        <section>
          <h2 className="text-xl mb-2">Your Choices</h2>
          <ul>
            <li>Disable cookies in your browser (may affect features).</li>
            <li>Use Google&apos;s Ads Settings to manage ad personalization.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl mb-2">Data Retention</h2>
          <p>
            We retain data only as long as necessary for the purposes described above.
          </p>
        </section>

        <section>
          <h2 className="text-xl mb-2">Contact</h2>
          <p>Email: support@verseword.com</p>
        </section>

        <section>
          <h2 className="text-xl mb-2">Changes</h2>
          <p>
            We may update this policy; changes take effect when posted here.
          </p>
        </section>
      </div>
      <div className="mt-12 text-center text-gray-500 text-sm">© {year} Red Mountain Media LLC. All rights reserved.</div>
    </div>
  );
}



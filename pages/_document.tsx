// pages/_document.tsx
import Document, { Html, Head, Main, NextScript } from "next/document";

export default class MyDocument extends Document {
  render() {
    return (
      <Html lang="en">
        <Head>
            {/* Cache-bust with v=4 so Chrome stops using the old one */}
            <link rel="icon" href="/favicon.ico?v=4" sizes="any" />
            <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png?v=4" />
            <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png?v=4" />
            {/* Add at least one larger PNG so DPR=2/3 tabs don't fall back to the inline default */}
            <link rel="icon" type="image/png" sizes="192x192" href="/android-chrome-192x192.png?v=4" />
            {/* iOS home screen */}
            <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=4" />
            {/* (Optional) PWA manifest + theme color */}
            <link rel="manifest" href="/site.webmanifest?v=4" />
            <meta name="theme-color" content="#efefef" />
            </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}


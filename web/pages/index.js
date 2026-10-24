import dynamic from 'next/dynamic';
import Head from 'next/head';

// O launcher usa câmera, giroscópio e WebGL — só roda no cliente (ssr: false).
const Launcher = dynamic(() => import('../components/Launcher'), { ssr: false });

export default function Home() {
  return (
    <>
      <Head>
        <title>ATMOXR</title>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover"
        />
        <meta name="theme-color" content="#000000" />
      </Head>
      <Launcher />
    </>
  );
}

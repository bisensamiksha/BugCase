import browser from '../lib/browser';

export function Popup() {
  const { name, version } = browser.runtime.getManifest();

  return (
    <main className="w-80 p-4 font-sans">
      <h1 className="rounded bg-blue-500 px-2 py-1 text-lg font-bold text-white">
        Bug Reporter — ready
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        {name} v{version}
      </p>
    </main>
  );
}

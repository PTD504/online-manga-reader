type HeaderProps = {
  title: string;
  subtitle: string;
};

export default function Header({ title, subtitle }: HeaderProps) {
  return (
    <header className="rounded-xl border border-indigo-100 bg-white p-6 shadow-lg sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-500">Translation Workspace</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">{title}</h1>
      <p className="mt-3 text-sm text-neutral-600 sm:text-base">{subtitle}</p>
    </header>
  );
}

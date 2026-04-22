import { FormEvent, useState } from 'react';

interface Props {
  onSubmit: (name: string, version: string, asOf: string) => void;
  loading: boolean;
  initial: { name: string; version: string; asOf: string };
}

function parse(input: string): [string, string] {
  const trimmed = input.trim();
  const at = trimmed.lastIndexOf('@');
  if (at > 0) return [trimmed.slice(0, at), trimmed.slice(at + 1)];
  return [trimmed, 'latest'];
}

export default function PackageInput({ onSubmit, loading, initial }: Props) {
  const [value, setValue] = useState(() =>
    initial.name
      ? initial.version && initial.version !== 'latest'
        ? `${initial.name}@${initial.version}`
        : initial.name
      : '',
  );
  const [asOf, setAsOf] = useState(initial.asOf);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    const [name, version] = parse(value);
    onSubmit(name, version, asOf);
  };

  return (
    <form className="pkg-input" onSubmit={submit}>
      <span className="prompt">npm ▸</span>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="package-name  or  package-name@version"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
      />
      <div className={`as-of ${asOf ? 'set' : ''}`}>
        <span>as of</span>
        <input
          type="date"
          value={asOf}
          onChange={(e) => setAsOf(e.target.value)}
          max={new Date().toISOString().slice(0, 10)}
          title="Resolve dependency ranges using only versions published on or before this date"
        />
        {asOf && (
          <button
            type="button"
            className="as-of-clear"
            onClick={() => setAsOf('')}
            title="Clear date (use latest)"
          >
            ✕
          </button>
        )}
      </div>
      <button type="submit" disabled={loading || !value.trim()}>
        {loading ? 'resolving…' : 'analyze'}
      </button>
    </form>
  );
}

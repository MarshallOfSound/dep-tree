import { FormEvent, useState } from 'react';

interface Props {
  onSubmit: (name: string, version: string) => void;
  loading: boolean;
}

function parse(input: string): [string, string] {
  const trimmed = input.trim();
  const at = trimmed.lastIndexOf('@');
  if (at > 0) return [trimmed.slice(0, at), trimmed.slice(at + 1)];
  return [trimmed, 'latest'];
}

export default function PackageInput({ onSubmit, loading }: Props) {
  const [value, setValue] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    const [name, version] = parse(value);
    onSubmit(name, version);
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
      <button type="submit" disabled={loading || !value.trim()}>
        {loading ? 'resolving…' : 'analyze'}
      </button>
    </form>
  );
}

interface TopBarProps {
  title: string;
  subtitle: string;
  searchPlaceholder: string;
  value: string;
  onChange: (value: string) => void;
}

export const TopBar = ({
  title,
  subtitle,
  searchPlaceholder,
  value,
  onChange,
}: TopBarProps) => (
  <header className="topbar">
    <div className="title">{title}</div>
    <div className="hint">{subtitle}</div>
    <input
      className="search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={searchPlaceholder}
    />
  </header>
);

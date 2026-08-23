// Cores ShellInit
// designed and built by onyxlabs.

export function shellInitScript(): string {
  return `ship() {
  command ship "$@"
  local ship_exit_code=$?
  if { [ "$1" = "new" ] || [ "$1" = "latest" ]; } && [ -f "$HOME/.zero/last-cd" ]; then
    local target
    target="$(cat "$HOME/.zero/last-cd")"
    rm -f "$HOME/.zero/last-cd"
    [ -d "$target" ] && cd "$target"
  fi
  return $ship_exit_code
}
`;
}

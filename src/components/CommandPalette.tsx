import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Search } from 'lucide-react'

export interface EditorCommand { name: string; group: string; shortcut?: string; disabled?: boolean; run: () => void }
export default function CommandPalette({ commands, onClose }: { commands: EditorCommand[]; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const results = commands.filter(command => `${command.name} ${command.group}`.toLowerCase().includes(query.toLowerCase()))
  useEffect(() => { dialog.current?.querySelector(`#command-${active}`)?.scrollIntoView({ block: 'nearest' }) }, [active, query])
  useEffect(() => {
    const previous = document.activeElement
    dialog.current?.showModal()
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }) }
  }, [])
  function run(command?: EditorCommand) { if (command && !command.disabled) { onClose(); requestAnimationFrame(command.run) } }
  return <dialog ref={dialog} className="command-dialog" aria-label="Command palette" onCancel={event => { event.preventDefault(); onClose() }}>
    <div className="command-search"><Search size={20} /><input autoFocus role="combobox" aria-label="Find a command" aria-expanded="true" aria-controls="command-results" aria-activedescendant={results[active] ? `command-${active}` : undefined} placeholder="What would you like to do?" value={query} onChange={event => { setQuery(event.target.value); setActive(0) }} onKeyDown={event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setActive(value => Math.max(0, Math.min(results.length - 1, value + (event.key === 'ArrowDown' ? 1 : -1)))) }
      if (event.key === 'Enter') { event.preventDefault(); run(results[active]) }
    }} /><button onClick={onClose} aria-label="Close command palette"><kbd>esc</kbd></button></div>
    <div className="command-results" id="command-results" role="listbox" aria-label="Commands">{results.map((command, index) => <button key={command.name} id={`command-${index}`} role="option" aria-selected={index === active} aria-disabled={command.disabled || undefined} onMouseMove={() => setActive(index)} onClick={() => run(command)}><ArrowUpRight size={15} /><span>{command.name}<small>{command.group}</small></span>{command.shortcut && <kbd>{command.shortcut}</kbd>}</button>)}{!results.length && <p>No matching commands.</p>}</div>
    <div className="command-footer"><span>↑ ↓ Navigate</span><span>↵ Run command</span><span>esc Close</span></div>
  </dialog>
}

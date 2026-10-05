import { useEffect, useState } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { api, messageOf } from '../api'
import { IS_HOSTED } from '../config'

export default function ServiceStatus() {
  const [error, setError] = useState('')
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    let active = true
    const check = async () => {
      try { await api.checkService(true); if (active) setError('') }
      catch (error) { if (active) setError(messageOf(error)) }
    }
    void check()
    const timer = window.setInterval(() => { if (!document.hidden) void check() }, IS_HOSTED ? 60000 : 15000)
    window.addEventListener('focus', check)
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', check) }
  }, [])

  if (!error) return null
  return <aside className="service-status" role="alert">
    <AlertCircle size={21} />
    <div><strong>The PDF service needs attention</strong><p>{error}</p></div>
    <button className="button secondary" disabled={retrying} onClick={async () => {
      setRetrying(true)
      try { await api.checkService(true); setError('') } catch (error) { setError(messageOf(error)) }
      finally { setRetrying(false) }
    }}><RefreshCw size={15} className={retrying ? 'spin' : ''} /> Check again</button>
  </aside>
}

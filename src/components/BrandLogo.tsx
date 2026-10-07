import { assetUrl } from '../config'

export default function BrandLogo({ inverse = false }: { inverse?: boolean }) {
  return <img className="brand-lockup" src={assetUrl(inverse ? '/brand/reage-logo-inverse.svg' : '/brand/reage-logo.svg')} alt="Reage" width="135" height="40" />
}

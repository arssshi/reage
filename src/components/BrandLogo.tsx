export default function BrandLogo({ inverse = false }: { inverse?: boolean }) {
  return <img className="brand-lockup" src={inverse ? '/brand/reage-logo-inverse.svg' : '/brand/reage-logo.svg'} alt="reage" width="135" height="40" />
}

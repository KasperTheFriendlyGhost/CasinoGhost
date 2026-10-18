import type { ReactNode } from 'react';
import { isNative, openExternal } from '../lib/native';

/** A link to an outside page. In the native app it opens in an in-app Safari sheet. */
export function ExtLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={className}
      onClick={(e) => { if (isNative) { e.preventDefault(); openExternal(href); } }}>
      {children}
    </a>
  );
}

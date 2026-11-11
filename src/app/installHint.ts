import { parentStrings } from '../content/parent.he';

/**
 * Android browsers other than Chrome (Samsung Internet, Edge, Opera, Brave and others) build
 * their own wrapper app when the game is installed, aimed at an old Android version, and
 * Google Play Protect blocks it as unsafe. Chrome's install goes through Google and is fine.
 * So on those browsers the start screen shows parents a short note: install through Chrome.
 */
export function needsChromeToInstall(
  userAgent: string,
  standalone: boolean,
  isBrave: boolean,
): boolean {
  if (standalone || !/Android/i.test(userAgent)) return false;
  const otherBrowser =
    /SamsungBrowser|EdgA|OPR|Firefox|FxiOS|MiuiBrowser|YaBrowser|UCBrowser|HuaweiBrowser|HeyTapBrowser|VivoBrowser|DuckDuckGo/i;
  return isBrave || otherBrowser.test(userAgent) || !/Chrome\//.test(userAgent);
}

let note: HTMLDivElement | null = null;

/** Shows the note over the start screen, if this browser needs it. */
export function showInstallHint(): void {
  const standalone = matchMedia('(display-mode: standalone)').matches;
  const isBrave = 'brave' in navigator;
  if (!needsChromeToInstall(navigator.userAgent, standalone, isBrave)) return;
  const text = parentStrings.install;
  note = document.createElement('div');
  note.className = 'install-hint';
  note.setAttribute('role', 'note');
  const message = document.createElement('p');
  message.textContent = text.message;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'install-hint-close';
  close.textContent = text.close;
  close.addEventListener('click', hideInstallHint);
  note.append(message, close);
  // A tap on the note isn't the child's "start".
  note.addEventListener('pointerdown', (event) => event.stopPropagation());
  note.addEventListener('pointerup', (event) => event.stopPropagation());
  document.body.appendChild(note);
}

export function hideInstallHint(): void {
  note?.remove();
  note = null;
}

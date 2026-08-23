import { type SVGProps } from "react"

import LogoMark from "@/assets/icons/logo-mark.svg?react"
import IconHome from "@/assets/icons/icon-home.svg?react"
import IconSearch from "@/assets/icons/icon-search.svg?react"
import IconCompose from "@/assets/icons/icon-compose.svg?react"
import IconProfile from "@/assets/icons/icon-profile.svg?react"
import IconMessages from "@/assets/icons/icon-messages.svg?react"
import IconMenu from "@/assets/icons/icon-menu.svg?react"

type IconComponent = (props: SVGProps<SVGSVGElement>) => React.ReactElement

// Threads' own design-system tokens (extracted from a live www.threads.com capture):
// --fds-soft easing + their "extra-short-out" 150ms duration, and #282828 as the
// dark-mode hover gray. Used for every interactive hover in this rail.
const THREADS_EASE = "ease-[cubic-bezier(0.08,0.52,0.52,1)]"
const THREADS_DURATION = "duration-150"

// HeroUI's actual button press animation (@heroui/styles button.css): color/background
// transition at 100ms ease-out, transform at 250ms ease, scale(0.97) while pressed —
// combined here with the Threads hover values above via per-property duration/easing lists.
const PRESS_STYLE = {
  transitionProperty: "color, background-color, transform",
  transitionDuration: "150ms, 150ms, 250ms",
  transitionTimingFunction: "cubic-bezier(0.08,0.52,0.52,1), cubic-bezier(0.08,0.52,0.52,1), ease",
}

function NavIcon({ icon: Icon, active, label }: { icon: IconComponent; active?: boolean; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={active ? "page" : undefined}
      style={PRESS_STYLE}
      className={`group flex h-11 w-11 items-center justify-center rounded-full hover:bg-[#282828] active:scale-[0.97] ${
        active ? "text-white" : "text-neutral-400 hover:text-neutral-200"
      }`}
    >
      <Icon className="h-6 w-6" />
    </button>
  )
}

export function Sidebar() {
  return (
    <aside className="ml-[2.625rem] flex h-full w-20 flex-none flex-col items-center justify-between py-10">
      <LogoMark className="h-8 w-9 text-white" aria-label="Corvo" />

      <nav className="flex flex-col items-center gap-6">
        <NavIcon icon={IconHome} active label="Home" />
        <NavIcon icon={IconSearch} label="Search" />

        <button
          type="button"
          aria-label="New post"
          className={`flex h-[3.375rem] w-[4.9375rem] items-center justify-center rounded-[1.25rem] bg-[#161616] text-neutral-400 transition-colors ${THREADS_DURATION} ${THREADS_EASE} hover:bg-[#282828] hover:text-neutral-200`}
        >
          <IconCompose className="h-[1.375rem] w-[1.375rem]" />
        </button>

        <NavIcon icon={IconProfile} label="Profile" />
        <NavIcon icon={IconMessages} label="Messages" />
      </nav>

      <button
        type="button"
        aria-label="Menu"
        style={PRESS_STYLE}
        className="flex h-11 w-11 items-center justify-center rounded-full text-neutral-400 hover:bg-[#282828] hover:text-neutral-200 active:scale-[0.97]"
      >
        <IconMenu className="h-[1.375rem] w-[1.75rem]" />
      </button>
    </aside>
  )
}

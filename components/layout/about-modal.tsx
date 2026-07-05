"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { useBodyScrollLock } from "@/lib/hooks/use-body-scroll-lock";
import { DUR, EASE } from "@/lib/motion/constants";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function AboutModal({ open, onClose }: Props) {
  const { translate, locale } = useLocale();
  const reduce = useReducedMotion();
  const zh = locale === "zh";

  useBodyScrollLock(open);

  const paragraphs = zh
    ? [
        "做一个球鞋信息平台的想法，在我脑子里已经有一年了。那时候 AI 编程还远没有现在成熟，而我对写代码几乎一窍不通（现在算懂一点点吧），所以一度放弃了。是技术的发展，才让我有机会把最初的想法变成现实。",
        "我自己每次买鞋都要花大量时间纠结。YouTube 和博客对一双鞋的评价往往带偏见；而且各家品牌的技术名词五花八门、功能与卖点各不相同，很难横向比较。sneakerfeature 就是想把这些信息中立、客观地呈现出来，帮你省点时间，买到更符合自己偏好和脚感的那双。",
        "作为一名高中生，无论是从零搭网站还是运营社区，我都还在摸索。如果你有任何建议，或愿意来当管理员（审核球鞋投稿）或开发者，欢迎点任意页面底部的「联系」找我。同时也请不要人身攻击或发布攻击他人的言论（吐槽某双鞋很烂是可以的）。",
        "另外，如果以后真的有很多人喜欢，我可能会对每个账号收取一次性 1 美元，用来覆盖数据库、域名等开销。我自己也讨厌广告，所以最多放 1、2 个，绝不会满屏都是。这个以后再定。",
      ]
    : [
        `The idea of a platform with information on sneakers has been with me for a year. Back then, AI coding was not yet a well-developed field. Therefore, since I know absolutely nothing about coding (a bit now, I suppose), I quit. The development of technology enabled me to turn the initial idea into reality.`,
        `I always spend tons of time choosing which sneaker to purchase. YouTube channels and blogs tend to have biased opinions on a shoe. Moreover, the technologies each brand presents vary in their names, function, and appeal to players. sneakerfeature is designed to show unbiased information in the hope of saving you some time when deciding which shoe to purchase, and to make a purchase that fits best with your preference and taste.`,
        `As a high school student, I am new to both building a website from scratch and maintaining a community. If you have any advice or would like to join as an admin (review shoe uploads) or developer, please feel free to press "Contact" in the menu. At the same time, please don't post comments that attack others (you can say a sneaker is bad, though).`,
        `By the way, if this turns out to be liked by many, perhaps I'll charge a one-time fee of a dollar per account to cover the cost of the database, domain, and so on. I hate ads myself, so there may be 1 or 2, but definitely not scattered around the page. I'll decide later.`,
      ];
  const closing = zh ? "在那之前，尽情逛吧！" : "In the meantime, enjoy!";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-[rgb(var(--glass-overlay)/0.72)] px-4 backdrop-blur-sm"
          style={{ padding: "max(1rem, var(--top-nav-h)) 1rem max(1rem, var(--mobile-nav-h))" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : DUR.base, ease: EASE }}
          onClick={onClose}
        >
          <motion.div
            className="glass-strong glass-rim glass-clip liquid-interactive relative w-full max-w-2xl rounded-3xl p-5 md:p-6"
            initial={{ y: reduce ? 0 : 18, opacity: 0, scale: reduce ? 1 : 0.985 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: reduce ? 0 : 8, opacity: 0, scale: reduce ? 1 : 0.985 }}
            transition={{ duration: reduce ? 0 : DUR.slow, ease: EASE }}
            onClick={(e) => e.stopPropagation()}
          >
        <button
          type="button"
          aria-label={translate("Close information modal")}
          className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-md text-[rgb(var(--subtext))] transition hover:bg-[rgb(var(--muted)/0.28)] hover:text-[rgb(var(--text))]"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
        <div className="pr-10">
          <h3 className="text-xl font-semibold tracking-[0.015em]">{zh ? "你好！" : "Hi!"}</h3>
          <p className="mt-1 text-[0.78rem] soft-text">{zh ? "写在前面" : "A note from the maker"}</p>
        </div>
        <div className="mt-4 max-h-[55vh] space-y-3 overflow-y-auto pr-1 text-[0.85rem] leading-[1.55] soft-text">
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          <p>{closing}</p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

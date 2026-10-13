import { MARK_PATH, WORDMARK_PATH } from "@/config/logo";

/**
 * Заставка при входе: знак-«точка» всплывает крупно по центру, плавно отъезжает
 * на своё место, выезжает надпись, затем логотип увеличивается и растворяется.
 *
 * Анимируются только transform и opacity обычных блоков (не частей SVG) —
 * их рисует видеокарта, поэтому движение плавное, даже пока грузится сайт.
 * Стили — .intro в globals.css. Показывается один раз за визит (INTRO_SCRIPT).
 */
export function Intro() {
  return (
    <div className="intro" aria-hidden>
      <div className="intro-logo">
        <div className="intro-glide">
          <div className="intro-mark">
            <svg viewBox="15 194 149 232" fill="#ffffff">
              <path fillRule="evenodd" d={MARK_PATH} />
            </svg>
          </div>
        </div>
        <div className="intro-word">
          <svg viewBox="207 194 415 232" fill="#ffffff">
            <path fillRule="evenodd" d={WORDMARK_PATH} />
          </svg>
        </div>
      </div>
    </div>
  );
}

/** Выполняется до отрисовки: повторно за визит заставку не показываем. */
export const INTRO_SCRIPT = `try{var s=window.sessionStorage;if(location.pathname.indexOf("/admin")===0||s.getItem("vt:intro"))document.documentElement.classList.add("no-intro");else s.setItem("vt:intro","1")}catch(e){}`;

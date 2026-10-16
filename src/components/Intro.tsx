import { MARK_PATH, WORDMARK_PATH } from "@/config/logo";
import { STORE_STORAGE_KEY, storeInfos } from "@/config/stores";

/**
 * Заставка при входе: знак-«точка» всплывает крупно по центру, плавно отъезжает
 * на своё место, выезжает надпись, затем логотип увеличивается и растворяется.
 *
 * Анимируются только transform и opacity обычных блоков (не частей SVG) —
 * их рисует видеокарта, поэтому движение плавное, даже пока грузится сайт.
 * Стили — .intro в globals.css. Показывается один раз за визит (INTRO_SCRIPT),
 * касание экрана сразу её убирает.
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

const storeIds = JSON.stringify(storeInfos.map((s) => s.id));

/**
 * Выполняется до отрисовки, без React (работает, даже если скрипты сайта не загрузились):
 *  1. На главной с запомненной точкой — сразу переход в её каталог, не дожидаясь загрузки сайта
 *     (?change=1 — показать выбор). Заставку при этом не «тратим» — она покажется в каталоге.
 *  2. Заставка — один раз за визит; в админке не показывается; касание экрана её пропускает.
 */
export const INTRO_SCRIPT = `(function(){try{var d=document.documentElement,l=location;
if(l.pathname==="/"&&!/[?&]change(=|&|$)/.test(l.search)){var t=localStorage.getItem(${JSON.stringify(STORE_STORAGE_KEY)});
if(${storeIds}.indexOf(t)>=0){d.className+=" no-intro vt-redirect";setTimeout(function(){d.className=d.className.replace(" vt-redirect","")},4000);l.replace("/"+t+l.hash);return}}
var s=sessionStorage;if(l.pathname.indexOf("/admin")===0||s.getItem("vt:intro")){d.className+=" no-intro";return}s.setItem("vt:intro","1");
var skip=function(){d.className+=" intro-skip"};document.addEventListener("touchstart",skip,{passive:true,once:true});document.addEventListener("mousedown",skip,{once:true})
}catch(e){}})()`;

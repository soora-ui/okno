"use client";

import { createContext, useContext } from "react";

/**
 * Страница открыта как демо (демо-кабинет тура): компоненты, которые сами
 * ходят на сервер мимо форм — переключатели, генерация дизайна — вместо
 * запроса имитируют результат. Формы перехватывает DemoCabinetGuard.
 */
const DemoModeContext = createContext(false);

export function DemoModeProvider({ children }: { children: React.ReactNode }) {
  return <DemoModeContext.Provider value>{children}</DemoModeContext.Provider>;
}

export function useDemoMode() {
  return useContext(DemoModeContext);
}

/** Событие на форме, чью отправку перехватил DemoCabinetGuard. */
export const DEMO_SUBMIT_EVENT = "okno-demo-submit";

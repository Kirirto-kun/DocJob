# Landing contact form with 3D Earth — дизайн

**Дата:** 2026-06-22
**Статус:** утверждён, готов к написанию плана реализации

## Контекст и решение

На лендинге DocJob (`src/app/landing/page.tsx`, секция `#contacts`) сейчас есть
карточка с адресом и email (`docjob@inbox.kz`). Нужно добавить **ниже** этой
карточки секцию обратной связи с **3D-анимацией Земли** и формой, как в
референсе [ladunjexa/reactjs18-3d-portfolio](https://github.com/ladunjexa/reactjs18-3d-portfolio)
(секция «Contact»). Сообщения из формы должны приходить на нашу почту.

### Принятые решения

- **3D-Земля:** точно как в референсе — `three` + `@react-three/fiber` + `@react-three/drei`
  с GLTF-моделью. (Не лёгкий globe — нужен идентичный вид.)
- **Отправка:** через существующий модуль `sendEmail` (Resend), НЕ через EmailJS.
- **Получатель:** `SITE_EMAIL` = `docjob@inbox.kz`.
- **i18n:** добавляем ключи ru/kk (лендинг полностью переведён).
- **Лицензия модели:** CC-BY-4.0 — обязательна атрибуция автора (cmzw).

## Архитектура

### Зависимости и ассеты

- npm: `three@^0.161`, `@react-three/fiber@^8`, `@react-three/drei@^9`, dev `@types/three`.
  Все совместимы с React 18, которым пользуется проект.
- Ассеты модели копируются в `public/planet/`: `scene.gltf`, `scene.bin`,
  `textures/Clouds_baseColor.png`, `textures/Planet_baseColor.png`, `license.txt`.
  Источник — `public/planet/` референс-репозитория.

### Email-слой (расширение)

- `src/lib/email.ts`:
  - `SendEmailInput` получает опциональное поле `replyTo?: string`; `sendEmail`
    передаёт его в Resend как `reply_to` (и логирует в dev-fallback).
  - Новая чистая функция `buildContactEmail({ name, email, message })` →
    `{ subject, html, text }`. Тема: «Новое сообщение с сайта — DocJob».
    Тело содержит имя, email и текст сообщения. Бренд — «DocJob» (не «MEDIZO»).

### Серверный экшен

- `src/app/actions.ts` → `sendContactMessage(input)`:
  - Zod-схема: `name` (1..100), `email` (email, ≤200), `message` (1..2000),
    `company` (honeypot — строка, должна быть пустой).
  - Если `company` непустой → возвращаем `ok` (тихо отбрасываем спам, не палим
    honeypot).
  - Иначе шлём письмо через `sendEmail` на `SITE_EMAIL` с `replyTo` = email
    отправителя. Ошибку отправки логируем и возвращаем `fail` с нейтральным текстом.
  - Возвращает `ActionResult<{ sent: true }>`.
  - Импортирует `SITE_EMAIL` из `@/lib/site`.

### Клиентские компоненты

- `src/components/landing/earth-canvas.tsx` (`'use client'`) — порт `Earth.tsx`/
  `EarthCanvas`: `<Canvas>` (shadows, `frameloop="demand"`, dpr `[1,2]`, камера
  как в референсе) с `<Suspense>`, `OrbitControls` (autoRotate, без zoom/pan,
  polar angle зафиксирован), `<primitive object={useGLTF('/planet/scene.gltf').scene} scale={2.5}/>`,
  `<Preload all />`. Внизу файла `useGLTF.preload('/planet/scene.gltf')`. Лоадер —
  простой текст/спиннер через `Html` из drei.
- `src/components/landing/contact-form.tsx` (`'use client'`) — двухколоночный блок:
  - Слева — форма (react-hook-form + zod): поля имя/email/сообщение + скрытый
    honeypot `company` (`aria-hidden`, off-screen). Кнопка с состоянием
    «Отправка…». Сабмит вызывает `sendContactMessage`; успех/ошибка → `useToast`,
    при успехе форма очищается.
  - Справа — Земля, лениво подгружаемая: `const EarthCanvas = dynamic(() => import('./earth-canvas'), { ssr: false, loading: <placeholder/> })`.
    (Server Component не может использовать `ssr:false`, поэтому dynamic живёт
    внутри этого клиентского компонента.)
  - Тексты — через `useTranslations('landing.contacts.form')` (клиентский i18n
    уже доступен: `NextIntlClientProvider` есть в `src/app/layout.tsx`).
  - Анимация появления — framer-motion (уже в проекте).
  - Под Землёй — мелкая кредит-строка CC-BY-4.0 на автора модели.

### Интеграция в лендинг

- `src/app/landing/page.tsx`, секция `#contacts`: сразу после закрывающего
  `</Card>` карточки адрес/email вставляется заголовок формы + `<LandingContactForm />`.
  Лендинг — Server Component; импорт клиентского компонента допустим.

### i18n

- В `src/i18n/messages/ru.json` и `kk.json` под `landing.contacts` добавляется
  объект `form`: `heading`, `subtitle`, `nameLabel`, `namePlaceholder`,
  `emailLabel`, `emailPlaceholder`, `messageLabel`, `messagePlaceholder`,
  `submit`, `submitting`, `successTitle`, `successDescription`, `errorTitle`,
  `errorDescription`, `modelCredit`.

## Обработка ошибок

- Клиент: валидация полей (обязательность, формат email, лимиты длины) до отправки.
- Сервер: zod-валидация; honeypot-проверка; ошибки `sendEmail` ловятся, наружу —
  нейтральный `fail`.
- 3D: `<Suspense>` + dynamic `ssr:false` исключают SSR-краши three.js; пока модель
  грузится, показывается лоадер/плейсхолдер.

## Тестирование

- Unit (vitest): `buildContactEmail` содержит имя/email/сообщение в `text` и `html`,
  непустую тему.
- `npm run typecheck` — чисто.
- Ручная проверка: лендинг открывается, Земля вращается, форма отправляется,
  письмо приходит на `docjob@inbox.kz` с корректным `reply_to`; honeypot-сабмит
  не шлёт письмо.

## Что НЕ делаем (YAGNI)

EmailJS, капча/reCAPTCHA, хранение сообщений в БД, серверный rate-limit на Redis,
доп. 3D-объекты из референса (звёзды, шары, компьютер).

## Лицензия / атрибуция

Модель «Stylized planet» by cmzw — CC-BY-4.0. `public/planet/license.txt`
сохраняется; кредит-строка выводится в UI рядом с Землёй:
«3D-модель Земли — Stylized planet by cmzw (CC-BY-4.0)».

## Затрагиваемые/новые файлы

- `package.json` — `three`, `@react-three/fiber`, `@react-three/drei`, `@types/three`.
- `public/planet/*` — ассеты модели (новые).
- `src/lib/email.ts` — `replyTo` + `buildContactEmail` (+ тест `email.test.ts`).
- `src/app/actions.ts` — `sendContactMessage`.
- `src/components/landing/earth-canvas.tsx` — новый.
- `src/components/landing/contact-form.tsx` — новый.
- `src/app/landing/page.tsx` — рендер формы в секции `#contacts`.
- `src/i18n/messages/ru.json`, `kk.json` — ключи `landing.contacts.form.*`.

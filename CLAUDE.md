# 갓데이트 출석부 (GodDate Attendance)

기독교 기반 커플 매칭 모임 **갓데이트**의 회원·행사·조 편성·출석을 관리하는 관리자 전용 웹앱.
행사 당일 스태프 2명이 **태블릿 2대**로 이름을 묻고 바로 출석 체크한다. (명찰 번호 개념은 쓰지 않는다)

> 이 문서는 Claude Code가 개발할 때 따르는 기준 문서다. 기능·규칙이 바뀌면 이 문서를 먼저 고친다.
> UI 기준 화면은 `docs/prototype.html` (브라우저로 열어서 확인). 화면 구성·문구·동작은 프로토타입을 따른다.

---

## 1. 핵심 흐름

```
회원관리 (전체 명부, 한 번 등록하면 계속 사용)
   ↓
행사관리 → 행사 생성 (제N회 + 행사 이름)
   ↓ 행사 열기
   ① 참여 인원   회원 명부에서 이 행사 참여자를 골라 확정 (남·여 각 약 25명)
   ② 회차 관리   행사 아래에 회차(날짜)를 추가. 보통 1~5회차, 주 1회
   ③ 조 편성     회차별로 조를 나눔 (확정된 참여자만 대상)
   ④ 출석체크    회차별로 출석·차량 도착 체크 (확정된 참여자만 표시)
   ↓
통계 (행사별 회차 출석 / 회원 누적 참여·출석률)
```

- 출석은 **회차(session) 단위**로 기록된다.
- 같은 회원이 다음 행사에 참여해도 **같은 회원 레코드**로 출석이 누적된다.
- 용어: 행사 번호는 **"제3회"**, 행사 아래 날짜 단위는 **"1회차, 2회차…"**. 남자 = **형제**, 여자 = **자매**.

## 2. 기술 스택

| 영역 | 선택 |
|---|---|
| 프레임워크 | Next.js (App Router) + TypeScript |
| DB / 백엔드 | Convex (실시간 구독으로 태블릿 2대 동기화) |
| 배포 | Vercel (+ Convex production deployment) |
| 스타일 | Tailwind CSS |
| UI 컴포넌트 | shadcn/ui (Button, Input, Tabs, Dialog, Sheet, Table, Badge, Select, Checkbox) |
| 아이콘 | lucide-react |
| 토스트 / 되돌리기 | sonner |
| 표 | TanStack Table (shadcn Data Table) |
| 폼 검증 | react-hook-form + zod |
| 한글 초성 검색 | es-hangul (`getChoseong`) 또는 `lib/hangul.ts` 직접 구현 |
| 엑셀 입출력 | SheetJS (`xlsx`) |
| 세션 토큰 | `lib/token.ts` (Web Crypto HMAC, Next proxy·route와 Convex가 같은 코드 사용) |
| 테스트 | Vitest (순수 로직: 초성 검색, 번호판 검증, 조 편성 알고리즘) |

### 실제 구현 메모 (Next.js 16 / Convex 1.49 기준)
- Next 16에서 `middleware.ts`는 **`proxy.ts`**로 이름이 바뀌었다. 인증 검사는 루트의 `proxy.ts`.
- `cacheComponents: true`라서 쿠키·현재 시각은 `<Suspense>` 안에서 읽는다 (`app/(admin)/layout.tsx`의 `TokenGate`, `await connection()`).
- 스타일: 프로토타입 CSS를 `app/globals.css`의 `@layer components`로 옮기고, shadcn 토큰을 프로토타입 색에 연결했다. 모달은 shadcn Dialog(Base UI), 토스트는 sonner. 프로토타입 강조색은 `--brand`, 보조 글자색은 `--sub`(shadcn의 `--accent`/`--muted`와 이름 충돌 방지).
- 폰트는 Google Fonts `<link>`로 불러온다. `next.config.ts`의 Turbopack CSS 규칙(`@tailwindcss/turbopack`)이 `next/font`와 충돌하기 때문.
- Convex의 `SESSION_SECRET`은 `convex/convex.config.ts`의 `defineApp({ env })`로 선언하고 `env`로 읽는다.
- 쿼리에서는 현재 시각을 읽지 않는다: "오늘"이 필요한 쿼리는 `today` 인자를 받거나, 원자료를 내려주고 클라이언트가 계산한다.
- 클라이언트는 `components/admin.tsx`의 `useAQ`/`useAM`을 쓴다 (토큰 자동 첨부, 만료 시 로그인 화면으로 이동).
- 엑셀 일괄 등록은 붙여넣기(TSV)와 CSV 파일만 지원한다 (`lib/import.ts`). xlsx 파일 직접 읽기는 아직 없음.
- 개발용 예시 데이터: `npx convex run seed:run '{"reset":true}'` (조 편성 계산이 무거워 action에서 계산, mutation으로 저장).

### 초기 세팅

```bash
npm create convex@latest goddate-attendance   # Next.js 템플릿 선택
cd goddate-attendance
npx shadcn@latest init
npx shadcn@latest add button input tabs card dialog sheet table badge select checkbox sonner label textarea
npm i es-hangul xlsx jose zod react-hook-form @hookform/resolvers @tanstack/react-table lucide-react convex-helpers
npm i -D vitest
npx convex dev
```

### 환경변수

| 위치 | 이름 | 설명 |
|---|---|---|
| Vercel / `.env.local` | `ADMIN_ID` | 기본 `admin` |
| Vercel / `.env.local` | `ADMIN_PASSWORD` | 기본 `goddate` (운영에서는 바꿀 것) |
| Vercel / `.env.local` | `SESSION_SECRET` | 32자 이상 랜덤 문자열 |
| Vercel / `.env.local` | `NEXT_PUBLIC_CONVEX_URL` | `npx convex dev`가 자동 설정 |
| Convex 대시보드 env | `SESSION_SECRET` | Vercel과 **같은 값** (Convex 함수에서 토큰 검증) |

코드에 아이디·비밀번호·시크릿을 하드코딩하지 않는다.

## 3. 인증 (회원가입 없음, 관리자 1계정)

- `/login`에서 아이디/비밀번호 입력 → `POST /api/login`이 `ADMIN_ID`/`ADMIN_PASSWORD`와 비교.
- 성공 시 토큰 발급: `token = base64url(exp) + "." + HMAC_SHA256(SESSION_SECRET, exp)` (유효기간 12시간 권장, 행사 당일 하루 버티게).
- 토큰은 `httpOnly; Secure; SameSite=Lax` 쿠키 `gd_session`에 저장.
- `proxy.ts` (Next 16의 middleware): `/login`, `/api/login`, `/api/logout`을 제외한 모든 경로에서 쿠키 검증, 실패 시 `/login`으로 리다이렉트.
- **Convex 함수도 반드시 보호**: 루트 레이아웃(서버 컴포넌트)이 쿠키에서 토큰을 읽어 클라이언트 `AdminTokenProvider`로 내려주고, 모든 query/mutation은 `token` 인자를 받는다.
  `convex-helpers`의 `customQuery`/`customMutation`으로 `adminQuery`/`adminMutation` 래퍼를 만들어 Web Crypto로 HMAC·만료를 검증한다. 검증 실패 시 `ConvexError("UNAUTHORIZED")`.
- `POST /api/logout`은 쿠키 삭제.
- 로그인 실패 메시지: "아이디 또는 비밀번호가 맞지 않아요."

## 4. 데이터 모델 (`convex/schema.ts`)

```ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const gender = v.union(v.literal("M"), v.literal("F"));

export default defineSchema({
  // 전체 회원 명부. 필수는 name, gender 뿐. 나이/출생연도는 받지 않는다(행사 방침상 비공개).
  members: defineTable({
    name: v.string(),
    gender,
    phone: v.optional(v.string()),      // "010-1234-5678" 형식으로 정규화해서 저장
    church: v.optional(v.string()),
    cars: v.array(v.string()),          // "19저 2074" 형식. 여러 대 가능
    memo: v.optional(v.string()),
  })
    .index("by_name", ["name"])
    .index("by_phone", ["phone"]),

  // 행사: 제N회 + 이름
  events: defineTable({
    no: v.number(),                     // 고유
    name: v.string(),
    participantsLocked: v.optional(v.boolean()), // 인원 확정: 추가·제외 불가 (현장 등록은 예외)
  }).index("by_no", ["no"]),

  // 회차: 행사 아래 날짜. 회차 번호는 저장하지 않고 날짜 순서로 계산한다.
  sessions: defineTable({
    eventId: v.id("events"),
    date: v.string(),                   // "YYYY-MM-DD" (Asia/Seoul 기준), 행사 안에서 고유
  }).index("by_event_date", ["eventId", "date"]),

  // 행사 참여 확정 인원
  participants: defineTable({
    eventId: v.id("events"),
    memberId: v.id("members"),
    nameTagNo: v.optional(v.number()),  // 쓰지 않음 (예전 데이터 호환용). 화면·로직에서 명찰 번호를 쓰지 않는다
  })
    .index("by_event", ["eventId"])
    .index("by_member", ["memberId"])
    .index("by_event_member", ["eventId", "memberId"]),

  // 회차별 조 편성. kindId 없음 = 기본 조(회차당 1개, 대상 참여자 전체)
  // kindId = 추가 조 종류(식사조·게임조 등, 공통코드 GROUP_KIND, 대상은 그 회차 출석자). 회차·종류당 1개
  groupings: defineTable({
    sessionId: v.id("sessions"),
    kindId: v.optional(v.id("codes")),
    groupCount: v.number(),             // 2~12
    assignments: v.array(v.object({ memberId: v.id("members"), group: v.number() })), // group: 0부터
    locked: v.optional(v.boolean()),    // 조 확정: 저장 불가
  }).index("by_session", ["sessionId"]),

  // 회차별 출석
  attendance: defineTable({
    sessionId: v.id("sessions"),
    memberId: v.id("members"),
    checkedAt: v.number(),
    device: v.optional(v.string()),     // 쓰지 않음 (예전 태블릿 A/B 기록 호환용). 기기 구분 개념 없음
  })
    .index("by_session", ["sessionId"])
    .index("by_session_member", ["sessionId", "memberId"])
    .index("by_member", ["memberId"]),

  // 회차별 차량 도착
  carChecks: defineTable({
    sessionId: v.id("sessions"),
    memberId: v.id("members"),
    plate: v.string(),
    checkedAt: v.number(),
    device: v.optional(v.string()),     // 쓰지 않음 (호환용)
  })
    .index("by_session", ["sessionId"])
    .index("by_session_member", ["sessionId", "memberId"]),

  // 출석 화면 우측 "최근 체크" 로그
  checkLogs: defineTable({
    sessionId: v.id("sessions"),
    memberId: v.id("members"),
    kind: v.union(v.literal("in"), v.literal("out"), v.literal("car"), v.literal("carout")),
    device: v.optional(v.string()),     // 쓰지 않음 (호환용)
    at: v.number(),
  }).index("by_session", ["sessionId"]),

  // 공통코드 그룹. 화면은 key로 찾는다 (기본 그룹: CHECK_MEMO 출석 메모, lib/codes.ts SYSTEM_GROUPS)
  codeGroups: defineTable({ key: v.string(), name: v.string(), description: v.optional(v.string()) })
    .index("by_key", ["key"]),

  // 공통코드. order 순, active=false면 새로 고를 때 숨김
  codes: defineTable({ groupId: v.id("codeGroups"), label: v.string(), order: v.number(), active: v.boolean() })
    .index("by_group_order", ["groupId", "order"]),

  // 회차별 출석 메모 (코드 선택 + 짧은 글). 출석과 별개
  checkMemos: defineTable({
    sessionId: v.id("sessions"),
    memberId: v.id("members"),
    codeIds: v.array(v.id("codes")),
    text: v.optional(v.string()),
    device: v.optional(v.string()),     // 쓰지 않음 (호환용)
    updatedAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_session_member", ["sessionId", "memberId"])
    .index("by_member", ["memberId"]),
});
```

등록일은 Convex 기본 필드 `_creationTime`을 사용한다.

### 삭제 규칙 (cascade)
- 회원 삭제 → participants, groupings.assignments, attendance, carChecks, checkLogs, checkMemos에서 해당 회원 제거.
- 행사 삭제 → 하위 sessions, participants, 각 회차의 groupings/attendance/carChecks/checkLogs 삭제.
- 회차 삭제 → 해당 회차의 groupings/attendance/carChecks/checkLogs/checkMemos 삭제.
- 코드 삭제 → checkMemos.codeIds에서 제거(남은 내용 없으면 메모 삭제). 그룹 삭제 → 하위 코드도 같은 방식. 기본 그룹(SYSTEM_GROUPS)은 삭제·키 변경 불가.
- 참여자 제외 → participants 삭제 + 해당 행사 모든 회차 groupings에서 제거. 출석 기록은 남긴다(명단·통계에서는 참여자만 집계).
- 삭제는 모두 화면 안에서 확인 단계를 거친다 (`window.confirm` 사용 금지, 다이얼로그/인라인 확인).

## 5. Convex 함수 목록 (모두 `adminQuery`/`adminMutation`)

```
convex/members.ts       list, get, create, update, remove, importMany
convex/events.ts        list(회차 수·참여 남녀 수·다음 회차 포함), get, create, update, remove
convex/sessions.ts      listByEvent(번호 계산 포함), create, updateDate, remove
convex/participants.ts  listByEvent(member 조인), pool, addMany, remove, setLocked(인원 확정/취소)
convex/groupings.ts     getBySession(kindId?), save(kindId?, groupCount, assignments), setLocked(kindId?), addKind(글자 → GROUP_KIND 코드 찾기/만들기), removeKind
convex/checkin.ts       boardBySession(참여자+출석+차량+조번호+메모+로그 한 번에), checkIn, cancelCheckIn,
                        carIn, carOut, registerPlateAndCarIn, walkIn, setMemo
convex/codes.ts         listGroups, listCodes, byKey, ensureSystemGroups, createGroup, updateGroup, removeGroup,
                        createCode, updateCode, moveCode, removeCode
convex/stats.ts         byEvent(eventId), byMember()
convex/seed.ts          개발용 예시 데이터 (internalMutation, 운영에서 실행 금지)
```

- `checkIn`은 **멱등**: 이미 출석이면 새로 만들지 않고 기존 값을 반환(태블릿 2대 동시 탭 대비).
- `walkIn`: 회원 생성 → 참여자 추가 → 출석 → (차량 입력 시) 차량 등록·도착까지 한 트랜잭션.
- 날짜 비교의 "오늘"은 **Asia/Seoul** 기준으로 계산한다.

## 6. 입력 규칙 / 검증

| 항목 | 규칙 | 오류 문구 예 |
|---|---|---|
| 이름 | 필수, trim | "이름을 입력하세요." |
| 성별 | 필수, M/F | — (버튼 선택) |
| 휴대폰 | 선택. 입력 시 `010`+8자리 → `010-0000-0000`으로 정규화, 회원 간 중복 불가 | "010으로 시작하는 11자리 번호로 입력하세요. 비워 둬도 됩니다." / "이미 OOO님이 쓰는 번호예요." |
| 차량번호 | **두 칸 입력**: 앞자리 `^\d{2,3}[가-힣]$` (예: 19저, 123가) + 뒷자리 `^\d{4}$` (예: 2074). 저장은 `"19저 2074"`. 회원 간 중복 불가 | "앞자리는 숫자 2~3자리와 한글 한 글자예요." / "이미 OOO님 차량으로 등록된 번호예요." |
| 행사 번호 | 1 이상 정수, 중복 불가. 비우면 다음 번호 자동 | "제3회는 이미 ‘가을 갓데이트’로 등록돼 있어요." |
| 회차 날짜 | 필수, 같은 행사 안에서 중복 불가. 기본값 = 마지막 회차 + 7일 | "11.8(일)에는 이미 회차가 있어요." |
| 조 개수 | 2~12 | — |

- **출생연도·나이는 어떤 화면에서도 받거나 보여주지 않는다.**
- 동명이인은 카드/목록에 "동명이인" 표시 + 전화 뒷 4자리·조 번호로 구분.

## 7. 화면 명세

공통: 한국어 UI, **태블릿 가로(1024~1366px) 우선**, 폰 폭(390px)에서도 가로 스크롤 없음. 터치 영역 최소 44px. 라이트/다크 모두 지원.
색 토큰(프로토타입 기준): 배경 `#F3F5F4`, 강조 `#2E5E4E`, 형제 `#2F63A3`, 자매 `#B03F66`, 정상 `#1F7A4D`, 경고 `#A86A12`. 폰트 IBM Plex Sans KR / 제목 Gowun Batang / 숫자 IBM Plex Mono.
상단 앱 바: 로고 "갓데이트 출석부" · 회원관리 · 행사관리 · 통계 · 공통코드 · 로그아웃.

### 7.1 `/members` 회원관리
- 요약: 전체 / 형제 / 자매 / 차량 등록 수.
- 필터: 성별(전체/남/여), 검색(이름·**초성**·전화번호 일부·교회·차량번호).
- 표 컬럼: 이름(동명이인 배지), 성별, 연락처, 교회, 차량(번호판 모양), 메모, 등록일. 이름·등록일 정렬.
  - **참여 행사·출석률은 이 화면에 두지 않는다** (통계 화면으로 분리).
- 행 클릭 → 오른쪽/하단 시트: 이름*, 성별*, 휴대폰, 교회, 차량(두 칸 + 추가, 여러 대·삭제 가능), 메모, "참여 행사·출석률은 통계에서 보기 →"(통계 회원 누적 탭으로 이동 + 이름 검색), 회원 삭제(인라인 확인).
- **엑셀로 일괄 등록**: 엑셀에서 복사·붙여넣기(TSV) 또는 CSV 파일. 열 순서 `이름* · 성별*(남/여) · 휴대폰 · 교회 · 차량번호`. 첫 줄이 "이름"으로 시작하면 헤더로 무시.
  미리보기에서 행마다 `등록` / `건너뜀(같은 번호 회원 있음)` / `오류(사유)` 표시, 정상 행만 등록.

### 7.2 `/events` 행사 목록
- 상단 등록 폼: `제 [  ] 회` + 행사 이름 → "행사 등록".
- 목록(최근 번호가 위): 제N회 배지, 이름, 회차 수·기간, 참여 남/여 수, 다음 회차(또는 "종료"). 수정·삭제는 인라인, 행 클릭 → 행사 상세.

### 7.3 `/events/[eventId]/...` 행사 상세
상단 4단계 탭(현재 상태 요약 표시): ①참여 인원(`남 25 · 여 25`) ②회차 관리(`n개 회차`) ③조 편성(`4회차 5개 조`) ④출석체크(`4회차 38/50명`).
③④에는 회차 선택 칩(`1회차 · 10.18(일)`)이 있고, 기본 선택은 **오늘 이후 가장 가까운 회차**(없으면 마지막 회차). URL 쿼리 `?session=`로 유지.
회차나 참여자가 없으면 해당 단계로 안내하는 빈 화면을 보여준다.

#### ① `/participants` 참여 인원 (행사를 열면 처음 보이는 단계)
- 왼쪽: 회원 명부(이 행사 미참여자) — 성별 필터, 초성 검색, 체크박스, "보이는 사람 모두 선택", 각 행에 전화 뒷 4자리·과거 참여(제1회·제2회 / "첫 참여").
  "선택한 n명 추가".
- **인원 확정**: 오른쪽 위 "인원 확정" → 추가·제외 잠금(서버도 거부), 상단 안내 + "확정 취소"로 해제. 현장 등록은 확정 중에도 된다. 탭 요약에 "· 확정".
- 오른쪽: 확정 인원(형제/자매로 나눠 가나다순 `이름 ×`). 남녀 수가 다르면 "남녀 n명 차이" 경고.
- 제외 시 이미 출석 기록이 있으면 확인 다이얼로그.

#### ② `/sessions` 회차 관리
- 날짜 입력 + "회차 추가". 회차 번호는 날짜 순서로 자동.
- 목록: N회차, 날짜(요일), 상태(지난 회차/오늘/예정), 출석 n/N, 조 편성 여부, 차량 대수. 버튼: 날짜 변경, 삭제, 조 편성, 출석체크.

#### ③ `/groups` 조 편성
- 설정 바: 조 개수(− n조 +), 랜덤 방식(남녀 모두 랜덤 / 남자 고정·여자만 랜덤 / 여자 고정·남자만 랜덤), "이전 회차에 같은 조였던 이성 피하기" 체크(기본 켜짐), "N회차 편성 불러오기", "모두 비우기", **"랜덤 배정"**.
- 점수: 전에 같은 조였던 **남녀 쌍** 수(핵심), 같은 성별 재회 수, 미배정 수.
- 조 카드: `1조 · 10명 · [남녀 재회 n쌍 | 이성 모두 새 만남]`, 형제/자매 칩. 이전 회차에 만난 이성이 같은 조에 있으면 칩에 "재회" 표시. 고정 성별 칩은 점선.
- 칩 클릭 → 지난 편성 이력, 조 선택 버튼(각 조에 "재회 n명 / 새 만남" 표시), 미배정으로 빼기.
- "+ 추가" → 미배정자 다중 선택(이 조 이성과 만난 적 없는 사람 먼저).
- 변경 즉시 저장(자동 저장). 조 개수를 줄이면 없어진 조 인원은 미배정.
- **조 종류**: 회차 칩 아래 "조 종류" 줄 = `기본 조` + 이 회차에 추가한 종류 + "+ 조 종류 추가".
  - 추가는 글자로 적거나 공통코드 `GROUP_KIND`(조 종류) 코드를 눌러 고른다. 적은 글자가 코드에 없으면 코드로 자동 등록.
  - 추가하면 **그 회차 기본 조 배정을 복사**(출석자만, 조 개수도 같게)해서 시작하고, 거기서 바꾼다. "기본 조 불러오기"로 다시 복사 가능.
  - 추가 조 종류의 대상은 **그 회차 출석자만**(출석체크하면 미배정에 바로 들어옴, 출석 취소하면 빠짐). 서버 save도 출석자만 남긴다.
  - 겹침 비교: 기본 조 = 이전 회차 기본 조. 추가 종류 = 이전 회차의 같은 종류 + 같은 회차 기본 조.
  - 종류마다 조 개수·배정·확정이 따로. "이 회차에서 OO 삭제"(확정 중이면 불가).
  - 회차 관리 목록에 `기본 조 5개 ✓ · 식사조 5개`처럼 표시. 출석 카드는 기본 조만, 출석 상세에 "다른 조: 식사조 2조 · 게임조 1조".
  - 조 종류로 쓰이는 코드는 삭제 불가(‘사용 안 함’으로 숨김). 이름을 바꾸면 모든 회차에 반영.
- **조 확정**: 회차별·종류별 "조 확정" → 조 개수·랜덤·불러오기·비우기·칩 이동/추가 잠금(서버 save도 거부), "확정 취소"로 해제. 편성이 없으면 확정 불가. 탭 요약에 "· 확정".

#### ④ `/check` 출석체크 (가장 중요)
- 상단: 회차 칩, 모드: 출석 / 차량. (태블릿 A/B 같은 기기 구분은 없다)
- 요약: 형제 n/N, 자매 n/N, 차량 도착 n/N대 (진행 막대).
- **출석 모드**
  - 성별 탭, 큰 검색창(이름·**초성 "ㄱㅁㅅ"→김민수**·전화 뒷자리), "미출석만", "+ 현장 등록".
  - 이름 카드 그리드(가나다순), 줄 구성:
    1) 이름(크게) + **조 번호(예: 3조)** + 동명이인 표시 (같은 줄)
    2) 전화 뒷 4자리 + (출석자 중 차량 보유자 `차량 / 차량 ✓`) + 상태(미출석 / 출석 13:24)
    3) 메모 칸 (메모 태그 또는 "+ 메모")
  - **미출석 카드 탭 = 즉시 출석.** 토스트 `고민석 출석 · 3조` + 5초 "되돌리기". 검색어가 있었으면 지우고 검색창에 다시 포커스(다음 사람 바로 검색).
  - 출석 카드 탭 → 상세 시트: 연락처(가운데 마스킹)·출석 시각, **차량 체크**
    - 등록 차량 있음: 차량별 "도착 체크" 토글(다시 누르면 취소).
    - 등록 차량 없음: **두 칸 입력 `[19저] [2074]`** → "차량 등록하고 도착 체크" (회원 차량에도 저장).
    - 출석 취소(시트 안에서 확인).
  - 현장 등록: 이름*, 성별*, 휴대폰(선택), 차량(두 칸, 선택) → 회원 생성 + 참여자 추가 + 출석(+차량 도착).
  - **출석 메모**: 카드 아래 메모 칸(카드 본문과 별도 버튼, 출석 처리 안 함) → 메모 창에서 `CHECK_MEMO` 그룹 코드를 여러 개 선택 + 덧붙일 말(선택, 200자). 둘 다 비우고 저장하면 메모 삭제. 카드 메모 칸·출석 상세에 표시.
- **차량 모드**: 참여자 차량 카드(큰 번호판), 뒷 4자리 검색(일치 부분 강조), "미도착만", 탭으로 도착/취소, 소유자 출석 여부 표시.
- 우측: 이 회차 최근 체크 로그(시각, 이름, 출석/출석 취소/차량 도착/차량 취소).
- 명찰 번호·명찰/책자 지급 체크는 **하지 않는다** (요구사항에서 제외됨).
- Convex 실시간 구독으로 같은 회차를 연 여러 기기 화면이 즉시 같아야 한다.

### 7.5 `/codes` 공통코드
- 왼쪽: 그룹 목록(이름, 키, 코드 수, 기본 그룹 배지), "+ 그룹 추가"(이름*, 키*(영문 대문자·숫자·_), 설명). 기본 그룹이 없으면 "기본 코드와 함께 만들기".
- 오른쪽: 선택 그룹 정보 수정/삭제(인라인 확인), 코드 추가, 코드별 ▲▼ 순서, 수정, 사용 안 함/다시 사용, 삭제(메모 사용 건수 안내).
- 새 화면에서 코드가 필요하면 `lib/codes.ts`의 SYSTEM_GROUPS에 그룹을 추가하고 `codes.byKey`로 읽는다.

### 7.4 `/stats` 통계
- 탭: **행사별** / **차량 내역**(행사·회차를 골라 도착 체크된 차량번호·운전자만) / **회원 누적**.
- 행사별(행사 선택): 요약(진행한 회차 n/N, 평균 출석률, 형제·자매 출석률, 회차당 차량 평균) → 회차별 출석 표(형제 n/N, 자매 n/N, 전체 출석률 막대, 차량 대수, 예정 회차는 "예정") → 참여자별 출석 표(이름, 회차별 ✓/✕/·, 출석 n/진행 회차, 출석률). 정렬: 이름순 / 출석률 낮은 순.
- 회원 누적: 회원별 참여 행사마다 회차별 ✓/✕, 누적 출석 a/t, 출석률. 정렬: 이름순 / 참여 많은 순 / 출석률 낮은 순. 성별 필터·초성 검색.
- 출석률은 **오늘까지 진행된 회차만** 분모에 넣는다.
- (선택) 엑셀 내보내기.

## 8. 핵심 로직

### 8.1 초성 검색 (`lib/hangul.ts`)
검색어의 각 글자가 자음(ㄱ~ㅎ)이면 이름 글자의 초성과, 완성형이면 글자 그대로 비교하는 부분 문자열 매칭. `"ㄱ민ㅅ"` 같은 혼합 입력도 허용. 일치 구간은 하이라이트.
초성 = `CHO[Math.floor((code - 0xAC00) / 588)]`.

### 8.2 차량번호 (`lib/plate.ts`)
`normalizePlate("19저2074") → "19저 2074"`, `validateFront`, `validateBack`. 검색은 숫자만 추출한 뒷 4자리 부분 일치.

### 8.3 조 편성 알고리즘 (`lib/grouping.ts`, 순수 함수 + Vitest)
입력: 참여자 목록(id, gender), 조 개수 k, 이전 회차 편성들(같은 행사, 현재 회차보다 앞), 모드(`all|fixM|fixF`), 현재 배정, 겹침 방지 여부.

1. **이전 만남 맵**: 이전 회차마다 같은 조였던 모든 쌍 → 만난 회차 목록.
2. **가중치**: 이성 쌍 재회 = 10 × 횟수, 동성 쌍 재회 = 1 × 횟수. (이성 재회를 최우선으로 피함)
3. **모드**
   - `all`: 남녀 모두 비우고 다시 배정.
   - `fixM`: 남자는 현재 조 유지(미배정 남자는 남자가 적은 조부터 채움), 여자만 재배정. `fixF`는 반대.
   - 고정할 성별이 조에 한 명도 없으면 "먼저 직접 넣거나 이전 회차 편성을 불러오세요" 안내.
4. **조별 정원**: 성별마다 `floor(n/k)`, 나머지는 다른 성별이 적은 조부터 +1 (all 모드: 남자 여분은 앞 조, 여자 여분은 뒤 조).
5. **최적화** (겹침 방지 켜짐):
   - 무작위 배치에서 시작 → 랜덤 대상 성별을 번갈아 **헝가리안 알고리즘**으로 최적 재배정(행 = 사람, 열 = 조 정원 슬롯, 비용 = 그 조 이성들과의 재회 가중치 합) 8회 반복.
   - 같은 성별 두 명 맞바꾸기 로컬 서치로 동성 재회까지 줄임.
   - 20회 재시작 중 최소 비용 채택. 비용 0이면 조기 종료.
6. 겹침 방지 꺼짐: 정원만 맞춘 순수 랜덤.

참고: 남 25·여 25·5개 조면 5회차 동안 모든 이성을 정확히 한 번씩 만나는 것은 1회차부터 설계해야만 가능하다. 4~5회차에 재회가 남을 수 있으며, 화면에 그대로 수치로 보여준다.
(향후 옵션: "5회차 전체 일정 미리 생성" — 라틴 방진 방식으로 이성 재회 0 보장)

## 9. 폴더 구조 (권장)

```
app/
  login/page.tsx
  api/login/route.ts, api/logout/route.ts
  (admin)/layout.tsx            앱 바 + AdminTokenProvider + ConvexClientProvider
  (admin)/members/page.tsx
  (admin)/events/page.tsx
  (admin)/events/[eventId]/layout.tsx   4단계 탭 + 회차 칩
  (admin)/events/[eventId]/sessions/page.tsx
  (admin)/events/[eventId]/participants/page.tsx
  (admin)/events/[eventId]/groups/page.tsx
  (admin)/events/[eventId]/check/page.tsx
  (admin)/stats/page.tsx
  (admin)/codes/page.tsx        공통코드
components/ (members/, events/, groups/, check/, stats/, ui/ ← shadcn)
convex/ (schema.ts, lib/auth.ts, members.ts, events.ts, sessions.ts, participants.ts, groupings.ts, checkin.ts, codes.ts, stats.ts, seed.ts)
lib/ (codes.ts, hangul.ts, plate.ts, phone.ts, grouping.ts, hungarian.ts, date.ts, token.ts, import.ts, errors.ts, logic.test.ts)
proxy.ts
docs/prototype.html             UI 기준 프로토타입 (수정하지 않음)
```

## 10. 개발 단계 (순서대로, 단계마다 동작 확인 후 커밋)

1. **세팅·인증**: 프로젝트 생성, shadcn, 환경변수, `/login`, 쿠키 세션, middleware, Convex `adminQuery/adminMutation` 래퍼, 앱 바.
2. **스키마·시드**: `schema.ts`, `seed.ts`(회원 53명, 제1~3회 행사, 회차·참여자·출석 예시).
3. **회원관리**: 목록·검색(초성)·등록/수정/삭제 시트·차량 두 칸 입력·엑셀 일괄 등록.
4. **행사·회차**: 행사 CRUD, 행사 상세 탭 레이아웃, 회차 CRUD.
5. **참여 인원(행사 1단계)**: 명부에서 선택·확정, 제외.
6. **출석체크 (MVP 핵심)**: 카드 그리드, 초성 검색, 탭 즉시 체크 + 되돌리기, 상세 시트(차량 체크/등록, 취소), 현장 등록, 차량 모드, 로그, 실시간 동기화 확인(브라우저 2개).
7. **조 편성**: `lib/grouping.ts` + Vitest, 화면, 출석 카드에 조 번호 표시.
8. **통계**: 행사별·회원 누적, (선택) 엑셀 내보내기.
9. **배포**: `npx convex deploy`, Vercel 프로젝트 연결, 환경변수 등록, 운영 비밀번호 변경.

## 11. 코딩 규칙

- TypeScript strict. `any` 금지.
- Convex 인자는 `v` validator로 검증, 클라이언트 폼은 zod. 같은 규칙은 `lib/`에 한 번만 구현해 양쪽에서 사용.
- 모든 사용자 문구는 한국어, 해요체. 오류는 "무엇이 문제인지 + 어떻게 고치는지".
- `alert/confirm/prompt` 사용 금지 → shadcn Dialog/Sheet 또는 인라인 확인.
- 날짜는 `"YYYY-MM-DD"` 문자열(Asia/Seoul), 시각은 epoch ms.
- 개인정보(전화번호·차량번호)는 로그(console)에 남기지 않는다. 출석 상세에서 전화번호는 가운데 마스킹.
- 커밋은 단계 단위로 작게.

## 12. 완료 체크리스트

- [ ] admin/goddate 외에는 어떤 페이지·Convex 함수도 접근 불가
- [ ] 태블릿 2대에서 같은 회차를 열고 한쪽에서 체크하면 다른 쪽에 1초 안에 반영
- [ ] 같은 사람을 두 태블릿에서 동시에 눌러도 출석 1건
- [ ] "ㄱㅁㅅ" 입력 시 김민수 카드가 나오고, 탭 후 검색창이 비워지며 포커스 유지
- [ ] 미등록 차량을 두 칸으로 입력 → 회원 차량에 저장 + 도착 체크
- [ ] 조 편성 후 출석 카드·토스트에 조 번호 표시
- [ ] 남자 고정 모드에서 랜덤해도 남자 배정이 바뀌지 않음
- [ ] 출생연도/나이가 어디에도 나오지 않음
- [ ] 390px 폭에서 가로 스크롤 없음

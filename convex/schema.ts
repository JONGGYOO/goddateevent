import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const gender = v.union(v.literal("M"), v.literal("F"));
export const logKind = v.union(v.literal("in"), v.literal("out"), v.literal("car"), v.literal("carout"));

export default defineSchema({
  // 전체 회원 명부. 필수는 name, gender 뿐. 나이/출생연도는 받지 않는다(행사 방침상 비공개).
  members: defineTable({
    name: v.string(),
    gender,
    phone: v.optional(v.string()), // "010-1234-5678" 형식으로 정규화해서 저장
    church: v.optional(v.string()),
    cars: v.array(v.string()), // "19저 2074" 형식. 여러 대 가능
    memo: v.optional(v.string()),
  })
    .index("by_name", ["name"])
    .index("by_phone", ["phone"]),

  // 행사: 제N회 + 이름
  events: defineTable({
    no: v.number(), // 고유
    name: v.string(),
    participantsLocked: v.optional(v.boolean()), // 참여 인원 확정: true면 추가·제외 불가 (현장 등록은 예외)
  }).index("by_no", ["no"]),

  // 회차: 행사 아래 날짜. 회차 번호는 저장하지 않고 날짜 순서로 계산한다.
  sessions: defineTable({
    eventId: v.id("events"),
    date: v.string(), // "YYYY-MM-DD" (Asia/Seoul 기준), 행사 안에서 고유
  }).index("by_event_date", ["eventId", "date"]),

  // 행사 참여 확정 인원
  participants: defineTable({
    eventId: v.id("events"),
    memberId: v.id("members"),
    nameTagNo: v.optional(v.number()), // 더 이상 쓰지 않음 (예전 데이터 호환용으로만 남김)
  })
    .index("by_event", ["eventId"])
    .index("by_member", ["memberId"])
    .index("by_event_member", ["eventId", "memberId"]),

  // 회차별 조 편성. kindId 없음 = 기본 조(회차당 1개), kindId = 추가 조 종류(공통코드 GROUP_KIND, 대상은 그 회차 출석자)
  groupings: defineTable({
    sessionId: v.id("sessions"),
    kindId: v.optional(v.id("codes")),
    groupCount: v.number(), // 2~12
    assignments: v.array(v.object({ memberId: v.id("members"), group: v.number() })), // group: 0부터
    locked: v.optional(v.boolean()), // 조 확정: true면 편성 저장 불가
  }).index("by_session", ["sessionId"]),

  // 회차별 출석
  attendance: defineTable({
    sessionId: v.id("sessions"),
    memberId: v.id("members"),
    checkedAt: v.number(),
    device: v.optional(v.string()), // 쓰지 않음 (예전 태블릿 A/B 기록 호환용)
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
    device: v.optional(v.string()), // 쓰지 않음 (예전 기록 호환용)
  })
    .index("by_session", ["sessionId"])
    .index("by_session_member", ["sessionId", "memberId"]),

  // 출석 화면 우측 "최근 체크" 로그
  checkLogs: defineTable({
    sessionId: v.id("sessions"),
    memberId: v.id("members"),
    kind: logKind,
    device: v.optional(v.string()), // 쓰지 않음 (예전 기록 호환용)
    at: v.number(),
  }).index("by_session", ["sessionId"]),

  // 공통코드 그룹 (예: CHECK_MEMO 출석 메모). key로 화면에서 찾는다
  codeGroups: defineTable({
    key: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
  }).index("by_key", ["key"]),

  // 공통코드. order 순으로 보여 주고, active=false면 새로 고를 때 숨긴다
  codes: defineTable({
    groupId: v.id("codeGroups"),
    label: v.string(),
    order: v.number(),
    active: v.boolean(),
  }).index("by_group_order", ["groupId", "order"]),

  // 회차별 출석 메모 (공통코드 선택 + 짧은 글). 출석과 별개라 미출석자도 남길 수 있다
  checkMemos: defineTable({
    sessionId: v.id("sessions"),
    memberId: v.id("members"),
    codeIds: v.array(v.id("codes")),
    text: v.optional(v.string()),
    device: v.optional(v.string()), // 쓰지 않음 (예전 기록 호환용)
    updatedAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_session_member", ["sessionId", "memberId"])
    .index("by_member", ["memberId"]),
});

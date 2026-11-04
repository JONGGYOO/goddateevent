"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { FunctionReturnType } from "convex/server";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAM, useAQ } from "@/components/admin";
import { Loading } from "@/components/kit";
import { MAX_LABEL, normalizeKey } from "@/lib/codes";
import { errInfo } from "@/lib/errors";

type Err = { field?: string; message: string } | null;

export default function CodesPage() {
  const data = useAQ(api.codes.listGroups, {});
  const ensure = useAM(api.codes.ensureSystemGroups);
  const [picked, setPicked] = useState<Id<"codeGroups"> | null>(null);
  const [adding, setAdding] = useState(false);

  const groups = data?.groups ?? [];
  const cur = groups.find((g) => g._id === picked) ?? groups[0];

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>공통코드</h1>
        </div>
      </div>
      {!data ? (
        <Loading />
      ) : (
        <div className="codesplit">
          <div className="stack" style={{ gap: 10 }}>
            {data.missing.length > 0 && (
              <div className="notice">
                <p>기본 그룹 {data.missing.map((m) => `‘${m.name}’`).join(", ")}이 없어요.</p>
                <div className="actions">
                  <button
                    className="btn sm"
                    type="button"
                    onClick={() =>
                      ensure({})
                        .then((r) => toast(`기본 그룹 ${r.created}개를 만들었어요`))
                        .catch((e) => toast(errInfo(e).message))
                    }
                  >
                    기본 코드와 함께 만들기
                  </button>
                </div>
              </div>
            )}
            <div className="box list grplist" role="list" aria-label="코드 그룹">
              {groups.length ? (
                groups.map((g) => (
                  <button
                    key={g._id}
                    type="button"
                    role="listitem"
                    className="it grpit"
                    aria-current={cur?._id === g._id}
                    onClick={() => {
                      setPicked(g._id);
                      setAdding(false);
                    }}
                  >
                    <div>
                      <div className="t1">
                        {g.name} {g.system && <span className="pill ac">기본</span>}
                      </div>
                      <div className="t2">
                        <span className="num">{g.key}</span>
                        <span>
                          코드 {g.active}
                          {g.count !== g.active ? ` / ${g.count}` : ""}개
                        </span>
                      </div>
                    </div>
                  </button>
                ))
              ) : (
                <div className="empty flat">아직 그룹이 없어요.</div>
              )}
            </div>
            {adding ? (
              <GroupForm onDone={(id) => (setAdding(false), id && setPicked(id))} />
            ) : (
              <button className="btn ghost" type="button" onClick={() => setAdding(true)}>
                + 그룹 추가
              </button>
            )}
          </div>
          {cur ? <GroupPanel key={cur._id} groupId={cur._id} /> : <div className="empty">왼쪽에서 그룹을 추가하세요.</div>}
        </div>
      )}
    </>
  );
}

/** 그룹 추가/수정 폼 */
function GroupForm({
  initial,
  system,
  onDone,
}: {
  initial?: { _id: Id<"codeGroups">; key: string; name: string; description?: string };
  system?: boolean;
  onDone: (id?: Id<"codeGroups">) => void;
}) {
  const create = useAM(api.codes.createGroup);
  const update = useAM(api.codes.updateGroup);
  const [key, setKey] = useState(initial?.key ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [desc, setDesc] = useState(initial?.description ?? "");
  const [err, setErr] = useState<Err>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      if (initial) {
        await update({ id: initial._id, key, name, description: desc });
        toast("그룹을 저장했어요");
        onDone();
      } else {
        const id = await create({ key, name, description: desc });
        toast(`‘${name.trim()}’ 그룹을 만들었어요. 코드를 추가하세요.`);
        onDone(id);
      }
    } catch (e2) {
      setErr(errInfo(e2));
      setBusy(false);
    }
  };

  return (
    <form className="box stack codeform" onSubmit={submit} noValidate autoComplete="off">
      <div className="field">
        <label htmlFor="gName">
          그룹 이름 <b>*</b>
        </label>
        <input
          id="gName"
          maxLength={30}
          placeholder="예: 결석 사유"
          value={name}
          autoFocus
          className={err?.field === "name" ? "bad" : ""}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="gKey">
          그룹 키 <b>*</b>
        </label>
        <input
          id="gKey"
          maxLength={30}
          placeholder="예: ABSENT_REASON"
          value={key}
          disabled={system}
          className={`num ${err?.field === "key" ? "bad" : ""}`}
          onChange={(e) => setKey(normalizeKey(e.target.value))}
        />
        <span className="hint">{system ? "기본 그룹은 키를 바꿀 수 없어요." : "화면이 이 키로 코드를 찾아요. 영문 대문자·숫자·_"}</span>
      </div>
      <div className="field">
        <label htmlFor="gDesc">설명</label>
        <input id="gDesc" maxLength={80} placeholder="어디에 쓰는 코드인지" value={desc} onChange={(e) => setDesc(e.target.value)} />
      </div>
      {err && <p className="errmsg">{err.message}</p>}
      <div className="actions">
        <button className="btn ghost sm" type="button" onClick={() => onDone()}>
          취소
        </button>
        <button className="btn sm" type="submit" disabled={busy}>
          {initial ? "저장" : "그룹 만들기"}
        </button>
      </div>
    </form>
  );
}

/** 선택한 그룹: 정보 수정·삭제, 코드 추가·수정·순서·사용 여부·삭제 */
function GroupPanel({ groupId }: { groupId: Id<"codeGroups"> }) {
  const data = useAQ(api.codes.listCodes, { groupId });
  const createCode = useAM(api.codes.createCode);
  const removeGroup = useAM(api.codes.removeGroup);
  const [label, setLabel] = useState("");
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  if (data === undefined) return <Loading />;
  if (data === null) return <div className="empty">그룹을 찾을 수 없어요.</div>;
  const { group, codes } = data;

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    try {
      await createCode({ groupId, label });
      setLabel("");
    } catch (e2) {
      setErr(errInfo(e2).message);
    }
  };

  return (
    <div className="stack" style={{ gap: 12 }}>
      {editing ? (
        <GroupForm initial={group} system={group.system} onDone={() => setEditing(false)} />
      ) : (
        <div className="box codehead">
          <div>
            <h2>
              {group.name} {group.system && <span className="pill ac">기본</span>}
            </h2>
            <div className="hint">
              <span className="num">{group.key}</span>
              {group.description && ` · ${group.description}`}
            </div>
          </div>
          <div className="acts">
            <button className="btn ghost sm" type="button" onClick={() => setEditing(true)}>
              그룹 수정
            </button>
            {!group.system && (
              <button className="btn ghost sm" type="button" onClick={() => setConfirmDel(true)}>
                그룹 삭제
              </button>
            )}
          </div>
        </div>
      )}
      {confirmDel && (
        <div className="notice err">
          <p>
            ‘{group.name}’ 그룹과 코드 {codes.length}개를 삭제할까요? 이 코드로 남긴 메모에서도 빠져요.
          </p>
          <div className="actions">
            <button className="btn ghost sm" type="button" onClick={() => setConfirmDel(false)}>
              아니요
            </button>
            <button
              className="btn danger sm"
              type="button"
              onClick={() =>
                removeGroup({ id: groupId })
                  .then(() => toast(`‘${group.name}’ 그룹을 삭제했어요`))
                  .catch((e) => toast(errInfo(e).message))
              }
            >
              삭제
            </button>
          </div>
        </div>
      )}

      <form className="inform codeadd" onSubmit={add} noValidate autoComplete="off">
        <div className="field">
          <label htmlFor="cLabel">코드 추가</label>
          <input
            id="cLabel"
            maxLength={MAX_LABEL}
            placeholder="예: 지각"
            value={label}
            className={err ? "bad" : ""}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <button className="btn" type="submit">
          추가
        </button>
        {err && <p className="errline">{err}</p>}
      </form>

      <div className="box list">
        {codes.length ? (
          codes.map((c, i) => <CodeRow key={c._id} code={c} first={i === 0} last={i === codes.length - 1} />)
        ) : (
          <div className="empty flat">아직 코드가 없어요. 위에서 추가하세요.</div>
        )}
      </div>
      <p className="hint" style={{ margin: 0 }}>
        위에서부터 순서대로 화면에 보여요. ‘사용 안 함’ 코드는 새로 고를 때 숨겨지고, 이미 남긴 메모에는 그대로 남아요.
      </p>
    </div>
  );
}

type CodeData = NonNullable<FunctionReturnType<typeof api.codes.listCodes>>["codes"][number];

function CodeRow({ code, first, last }: { code: CodeData; first: boolean; last: boolean }) {
  const update = useAM(api.codes.updateCode);
  const move = useAM(api.codes.moveCode);
  const remove = useAM(api.codes.removeCode);
  const [mode, setMode] = useState<"view" | "edit" | "del">("view");
  const [label, setLabel] = useState(code.label);
  const [err, setErr] = useState("");

  const run = (p: Promise<unknown>, ok?: string) =>
    p
      .then(() => {
        if (ok) toast(ok);
        setMode("view");
        setErr("");
      })
      .catch((e) => setErr(errInfo(e).message));

  const toggleActive = () => run(update({ id: code._id, label: code.label, active: !code.active }));
  const startEdit = () => {
    setLabel(code.label);
    setMode("edit");
  };

  return (
    <div className={`it coderow ${code.active ? "" : "off"} ${mode !== "view" ? "busy" : ""}`}>
      <div className="ord">
        <button className="btn ghost sm" type="button" aria-label="위로" disabled={first} onClick={() => run(move({ id: code._id, dir: -1 }))}>
          ▲
        </button>
        <button className="btn ghost sm" type="button" aria-label="아래로" disabled={last} onClick={() => run(move({ id: code._id, dir: 1 }))}>
          ▼
        </button>
      </div>
      {mode === "edit" ? (
        <div className="field">
          <input
            aria-label="코드 이름"
            className="tin"
            maxLength={MAX_LABEL}
            value={label}
            autoFocus
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") run(update({ id: code._id, label, active: code.active }), "코드를 저장했어요");
              if (e.key === "Escape") setMode("view");
            }}
          />
        </div>
      ) : (
        <div>
          <div className="t1">{mode === "del" ? `‘${code.label}’을 삭제할까요?` : code.label}</div>
          <div className="t2">
            {mode === "del" ? (
              <span>
                {code.usedAsKind
                  ? `${code.usedAsKind}개 회차 조 편성에서 쓰고 있어 지울 수 없어요. ‘사용 안 함’을 쓰세요.`
                  : code.used
                    ? `메모 ${code.used}건에서도 빠져요. 숨기기만 하려면 ‘사용 안 함’을 쓰세요.`
                    : "아직 쓰인 적 없는 코드예요."}
              </span>
            ) : (
              <>
                <span>{code.usedAsKind ? `조 편성 ${code.usedAsKind}개 회차` : code.used ? `메모 ${code.used}건` : "쓰인 적 없음"}</span>
                {!code.active && <span className="pill off">사용 안 함</span>}
              </>
            )}
          </div>
        </div>
      )}
      <div className="acts">
        {mode === "edit" ? (
          <>
            <button className="btn ghost sm" type="button" onClick={() => (setMode("view"), setLabel(code.label), setErr(""))}>
              취소
            </button>
            <button className="btn sm" type="button" onClick={() => run(update({ id: code._id, label, active: code.active }), "코드를 저장했어요")}>
              저장
            </button>
          </>
        ) : mode === "del" ? (
          <>
            <button className="btn ghost sm" type="button" onClick={() => setMode("view")}>
              아니요
            </button>
            <button className="btn danger sm" type="button" onClick={() => run(remove({ id: code._id }), `‘${code.label}’을 삭제했어요`)}>
              삭제
            </button>
          </>
        ) : (
          <>
            <span className="viewacts">
              <button className="btn ghost sm" type="button" onClick={toggleActive}>
                {code.active ? "사용 안 함" : "다시 사용"}
              </button>
              <button className="btn ghost sm" type="button" onClick={startEdit}>
                수정
              </button>
              <button className="btn ghost sm" type="button" onClick={() => setMode("del")}>
                삭제
              </button>
            </span>
            <RowMenu
              items={[
                ["이름 수정", startEdit],
                [code.active ? "사용 안 함" : "다시 사용", toggleActive],
                ["삭제", () => setMode("del")],
              ]}
            />
          </>
        )}
      </div>
      {err && <p className="errline">{err}</p>}
    </div>
  );
}

/** 휴대폰에서만 보이는 코드 줄 ⋯ 메뉴 (아래로 펼침) */
function RowMenu({ items }: { items: [string, () => void][] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);
  return (
    <div className="rowmenu" ref={ref}>
      <button type="button" className="rmbtn" aria-label="더 보기" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        ⋯
      </button>
      {open && (
        <div className="menu" role="menu">
          {items.map(([label, run]) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              className={label === "삭제" ? "del" : ""}
              onClick={() => {
                setOpen(false);
                run();
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

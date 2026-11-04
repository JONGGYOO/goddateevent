"use client";

import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { useAQ } from "@/components/admin";
import { G_OPTIONS, GN, Hl, Loading, SearchBox, Seg, Stat, countNames, type GFilter } from "@/components/kit";
import { MemberEditor } from "@/components/members/member-editor";
import { Importer } from "@/components/members/importer";
import { koCompare, matchAt, stripCho } from "@/lib/hangul";
import { fmtDate } from "@/lib/date";

type Editor = { member: Doc<"members"> | null } | null;

/** 이름·초성 / 전화번호 일부(3자리 이상) / 교회 / 차량번호 */
function matches(m: Doc<"members">, raw: string): boolean {
  const q = raw.replace(/\s+/g, "");
  if (!q) return true;
  if (matchAt(m.name, q) >= 0) return true;
  const dq = q.replace(/\D/g, "");
  if (dq.length >= 3 && ((m.phone ?? "").replace(/\D/g, "").includes(dq) || m.cars.some((c) => c.replace(/\D/g, "").includes(dq))))
    return true;
  return (!!m.church && m.church.includes(q)) || m.cars.some((c) => c.replace(/\s/g, "").includes(q));
}

export default function MembersPage() {
  const members = useAQ(api.members.list, {});
  const [g, setG] = useState<GFilter>("ALL");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: "name" | "created"; dir: 1 | -1 }>({ key: "name", dir: 1 });
  const [editor, setEditor] = useState<Editor>(null);
  const [importing, setImporting] = useState(false);

  const all = useMemo(() => members ?? [], [members]);
  const dup = useMemo(() => countNames(all.map((m) => m.name)), [all]);
  const rows = useMemo(() => {
    const r = all.filter((m) => (g === "ALL" || m.gender === g) && matches(m, q));
    r.sort((a, b) => {
      const d = sort.key === "name" ? koCompare(a.name, b.name) : a._creationTime - b._creationTime;
      return d * sort.dir || a._creationTime - b._creationTime;
    });
    return r;
  }, [all, g, q, sort]);

  const toggleSort = (key: "name" | "created") =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "name" ? 1 : -1 }));

  const qn = q.replace(/\s+/g, "");

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>회원관리</h1>
        </div>
        <div className="spacer" />
        <button className="btn ghost" type="button" onClick={() => setImporting(true)} disabled={!members}>
          엑셀로 일괄 등록
        </button>
        <button className="btn" type="button" onClick={() => setEditor({ member: null })} disabled={!members}>
          + 회원 등록
        </button>
      </div>

      <div className="mpills" aria-label="회원 요약">
        <span>
          전체<b>{all.length}</b>
        </span>
        <span className="M">
          형제<b>{all.filter((m) => m.gender === "M").length}</b>
        </span>
        <span className="F">
          자매<b>{all.filter((m) => m.gender === "F").length}</b>
        </span>
        <span>
          차량<b>{all.filter((m) => m.cars.length).length}</b>
        </span>
      </div>
      <section className="summary memsum">
        <Stat label="전체 회원" value={all.length} unit="명" />
        <Stat label="형제(남)" value={all.filter((m) => m.gender === "M").length} unit="명" />
        <Stat label="자매(여)" value={all.filter((m) => m.gender === "F").length} unit="명" />
        <Stat label="차량 등록" value={all.filter((m) => m.cars.length).length} unit="명" />
      </section>

      <div className="controls memtools">
        <Seg value={g} options={G_OPTIONS} onChange={setG} label="성별" />
        <SearchBox value={q} onChange={setQ} placeholder="이름·초성·전화번호·교회·차량번호" />
        <div className="msort">
          <Seg
            value={sort.key}
            onChange={(key) => setSort({ key, dir: key === "name" ? 1 : -1 })}
            label="정렬"
            options={[
              ["name", "이름순"],
              ["created", "최근"],
            ]}
          />
        </div>
      </div>

      {members && (
        <div className="mlist" role="list" aria-label="회원 목록">
          {rows.length ? (
            rows.map((m) => (
              <button key={m._id} type="button" role="listitem" className="mli" onClick={() => setEditor({ member: m })}>
                <span className="l1">
                  <span className={`dot ${m.gender}`} />
                  <span className="nm">
                    <Hl text={m.name} q={qn} />
                  </span>
                  {(dup.get(m.name) ?? 0) > 1 && <span className="pill w">동명이인</span>}
                  <span className="plates">
                    {m.cars[0] && <span className="plate">{m.cars[0]}</span>}
                    {m.cars.length > 1 && <span className="plate more">+{m.cars.length - 1}</span>}
                  </span>
                </span>
                <span className="l2">
                  {[m.phone && <span className="num">{m.phone}</span>, m.church, m.memo && <span className="memo">{m.memo}</span>]
                    .filter(Boolean)
                    .map((x, i) => (
                      <span key={i} className="it">
                        {x}
                      </span>
                    ))}
                  {!m.phone && !m.church && !m.memo && <span className="it muted">연락처·교회 없음</span>}
                </span>
              </button>
            ))
          ) : (
            <div className="empty flat">
              <strong>{q ? `‘${q}’에 맞는 회원이 없어요` : "아직 등록된 회원이 없어요"}</strong>
              <button className="btn" type="button" onClick={() => setEditor({ member: null })}>
                + 새 회원으로 등록
              </button>
            </div>
          )}
        </div>
      )}
      {!members ? (
        <Loading />
      ) : (
        <div className="tablewrap memtable">
          <table>
            <thead>
              <tr>
                <th>
                  <button type="button" onClick={() => toggleSort("name")}>
                    이름 ↕
                  </button>
                </th>
                <th>성별</th>
                <th>연락처</th>
                <th>교회</th>
                <th>차량</th>
                <th>메모</th>
                <th>
                  <button type="button" onClick={() => toggleSort("created")}>
                    등록일 ↕
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((m) => (
                  <tr
                    key={m._id}
                    className="click"
                    tabIndex={0}
                    onClick={() => setEditor({ member: m })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") setEditor({ member: m });
                    }}
                  >
                    <td>
                      <span className={`dot ${m.gender}`} />
                      <span className="nm">
                        <Hl text={m.name} q={qn} />
                      </span>
                      {(dup.get(m.name) ?? 0) > 1 && (
                        <>
                          {" "}
                          <span className="pill w">동명이인</span>
                        </>
                      )}
                    </td>
                    <td>
                      <span className={`pill ${m.gender}`}>{GN(m.gender)}</span>
                    </td>
                    <td className="num">{m.phone ?? <span className="muted">-</span>}</td>
                    <td>{m.church ?? <span className="muted">-</span>}</td>
                    <td>
                      {m.cars.length ? (
                        <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
                          {m.cars.map((c) => (
                            <span key={c} className="plate">
                              {c}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="muted">-</span>
                      )}
                    </td>
                    <td style={{ whiteSpace: "normal", maxWidth: 220 }}>{m.memo ?? <span className="muted">-</span>}</td>
                    <td className="num muted">{fmtDate(m._creationTime)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7}>
                    <div className="empty flat">
                      <strong>{q ? `‘${q}’에 맞는 회원이 없어요` : "아직 등록된 회원이 없어요"}</strong>
                      <button className="btn" type="button" onClick={() => setEditor({ member: null })}>
                        + 새 회원으로 등록
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <div className="foot">
        <span>
          {rows.length}명 표시 · 전체 {all.length}명 · 행을 누르면 정보를 보고 수정합니다
        </span>
      </div>

      {editor && (
        <MemberEditor
          key={editor.member?._id ?? "new"}
          member={editor.member}
          initial={{ name: stripCho(q.trim()), gender: g === "F" ? "F" : "M" }}
          members={all}
          onClose={() => setEditor(null)}
        />
      )}
      {importing && <Importer members={all} onClose={() => setImporting(false)} />}
    </>
  );
}

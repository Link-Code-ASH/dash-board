# Edu

Edu manages student profiles, freeform memos, consultations, and edit history.
Courses, tuition, and payments are outside this version.
The separate 문항 연구소 (`edu/lab`) manages research notes and printable questions.

## Student data and saving

The Dashboard snapshot owns `edu: { version: 1, students, consultations, events }`.
It uses existing account-scoped local journals, cloud revision checks, conflict
recovery, and full backups. No additional database table or backup provider is
required. Unsupported Edu data stays in the snapshot; the provider blocks edits
and displays an error instead of replacing the records.

`applyEduAction` produces a complete immutable Edu snapshot containing both the
change and its history. `EduProvider.save(action)` waits for the local journal to
flush and rejects on failure or account change. Cloud delivery follows existing
Dashboard synchronization. Saving is explicit; unchanged saves add no event.

## Age and academic year

Dates use `Asia/Seoul`. Counting age is `currentYear - birthYear + 1`.
Numeric grades 1–6 are primary school, 7–9 middle school, 10–12 high school,
and 13 graduation. Students retain an academic anchor with `referenceGrade`,
`referenceYear`, and `referenceId`; the current grade is derived from that anchor.
Manual corrections replace the anchor together. The Dashboard merge treats the
whole anchor as one value to avoid mixing different corrections.

Each January 1 transition has deterministic identity
`promotion:<studentId>:<referenceId>:<effectiveYear>` and effective midnight KST
as its timestamp. Startup, date boundaries, resume, and data synchronization
reconcile missing events. Duplicate reconciliation cannot advance grades twice.
Only middle grade 3 to high grade 1 displays the persistent confirmation badge.
Explicit confirmations refer to promotion event IDs, so confirmations survive
sync and do not hide later transitions. School names remain user-entered.

## Consultations and Flow

Consultations keep a Seoul calendar date and `HH:mm` time, plus title, notes,
student ID, and `scheduled`, `completed`, or `cancelled` status. Edu shows the
monthly calendar and daily agenda. The app-lifetime provider registers one `edu`
Flow source for the active account, using the same snapshot. Flow displays booked
consultations for its selected date, opens `edu/student:<id>`, and completes a
consultation through the same guarded save action. Account changes invalidate
the source and pending UI callbacks.

## Checks

Run `node --test tests/edu*.test.js` for model, Flow, storage, account guards,
backup, and concurrency scenarios. Run `npm test` and `npm run build` for the
whole app. On Windows, sandbox filesystem restrictions may require the Vite/PWA
checks to run outside the sandbox.

## 문항 연구소: Claude가 기록하는 공간

학생 관리의 `hub_user_data.payload.edu`와 연구소는 저장소가 다르다.
연구소는 `public.edu_notes`와 `public.edu_items`에만 기록한다.
기존 `hub_user_data`, `mindfold_*`, 학생/상담 데이터, localStorage는 수정하지 않는다.
앱의 기존 Dashboard/Vault 전체 백업에는 연구소 테이블이 포함되지 않는다.
연구소 백업은 Supabase 데이터베이스 백업 또는 두 테이블의 별도 내보내기를 사용한다.

애쉬가 문항·생각·피드백을 자유롭게 전달하면 Claude는 노트 종류와 적용 범위를
정리하여 기록한다. 문항을 만들면 문제, 선택지, 그림, 정답, 해설을 문항 한 행으로
기록하고 `review_state = 'unreviewed'`, `usage = 'hold'`로 둔다. 앱에서는 노트를 검색·수정하고,
문항을 검토하며 피드백과 상태를 저장하고, 선택한 문항을 시험지로 인쇄한다.
인쇄 창에서 PDF 저장을 선택할 수 있고 정답·해설 포함 여부를 앱에서 선택한다.

### 공통 칸 (두 테이블에 동일)

| 칸 | SQL 형식 / 기본값 | 의미 |
| --- | --- | --- |
| `id` | `text`, 필수 | 계정 안에서 고유한 식별자. 빈 문자열 금지. 예: `note-momentum-001`, `item-momentum-001`. 한 번 정하면 바꾸지 않는다. |
| `user_id` | `uuid`, 필수 | 애쉬의 `auth.users.id`. `(user_id, id)`가 기본키이다. 로그인 이메일 대신 UUID를 사용한다. |
| `revision` | `bigint`, `1` | 새 행은 반드시 `1`. 수정할 때 읽었던 값에 `1`을 더한다. |
| `created_at` | `timestamptz`, 서버 시각 | 트리거가 생성 시 설정한다. 이후 변경할 수 없다. |
| `updated_at` | `timestamptz`, 서버 시각 | 삽입/수정 시 트리거가 자동 설정한다. 작성자가 직접 관리하지 않는다. |
| `deleted_at` | `timestamptz`, `NULL` | `NULL`이면 활성 행. 삭제는 여기에 시각을 기록하는 수정으로 처리한다. |
| `extra` | `jsonb`, `{}` | 추가 정보용 JSON 객체. 기존 칸의 의미를 바꾸지 않고 여기에 새 정보를 넣는다. |

시간은 DB에서 시간대가 포함된 시각으로 저장한다. 날짜를 문서나 노트에 적을 때는
한국 시간(Asia/Seoul)을 기준으로 한다.
빈 선택 정보는 `NULL` 대신 빈 문자열, 빈 배열, 빈 객체를 사용한다.
`deleted_at`만 `NULL`을 허용한다. `id`, `user_id`, `created_at`은 수정할 수 없다.

### edu_notes: 생각·풀이법·피드백·제작 규칙

| 칸 | SQL 형식 / 기본값 | 의미 |
| --- | --- | --- |
| `kind` | `text`, `idea` | `principle` 제작 원칙(애쉬가 앱에서 작성, 가장 먼저 읽음), `idea` 아이디어, `method` 풀이법·사고방식, `feedback` 애쉬의 피드백, `rule` 제작 규칙. 자유 텍스트라 Claude가 새 종류를 추가할 수 있다. |
| `title` | `text`, `''` | 목록에 표시할 짧은 제목. |
| `body` | `text`, `''` | 노트 본문. 마크다운과 LaTeX 수식을 사용할 수 있다. |
| `scope` | `text`, `전 과목` | 적용 범위. 예: `물리학Ⅰ > 역학 > 운동량 보존`. 자유 텍스트. |
| `tags` | `text[]`, `{}` | 검색에 사용할 태그 목록. SQL에서는 `array['역학', '충돌']`. |
| `source` | `text`, `''` | 출처. 예: `교재명 p.32 7번`, `애쉬 피드백 2026-10-11`. |
| `related` | `text[]`, `{}` | 관련 노트 또는 문항의 `id` 목록. |

### edu_items: 문항

| 칸 | SQL 형식 / 기본값 | 의미 |
| --- | --- | --- |
| `title` | `text`, `''` | 목록용 제목. 문제 본문은 `stem`에 쓴다. |
| `subject` | `text`, `''` | 과목. 예: `물리학Ⅰ`. |
| `unit` | `text`, `''` | 단원. 예: `역학 > 운동량 보존`. |
| `difficulty` | `text`, `''` | 난이도. `최상`, `상`, `중`, `하` 또는 미정 `''`만 허용한다. Claude가 정하고 애쉬가 바꿀 수 있다. |
| `question_type` | `text`, `''` | `객관식`, `서술형` 등. 자유 텍스트. |
| `stem` | `text`, `''` | 문제 본문. 마크다운과 LaTeX 수식. |
| `choices` | `jsonb`, `[]` | 객관식 선택지를 표시 순서대로 담은 **문자열 배열**. 예: `["1 m/s", "2 m/s"]`. 번호는 앱에서 붙이므로 내용만 쓴다. 서술형은 `[]`. |
| `answer` | `text`, `''` | 정답. 객관식은 `②` 또는 `2`, 서술형은 답/수식. |
| `explanation` | `text`, `''` | 해설. 마크다운과 LaTeX 수식. |
| `figures` | `jsonb`, `[]` | 그림 배열. 각 항목은 `{"svg": "SVG 코드 문자열", "caption": "그림 설명"}`. 두 값 모두 문자열이며 그림이 없으면 `[]`. |
| `based_on` | `text[]`, `{}` | 제작 시 참고한 같은 계정의 `edu_notes.id` 목록. |
| `review_state` | `text`, `unreviewed` | 검토 상태. `unreviewed` 검토 전, `feedback` 피드백 작성(애쉬가 의견을 남겨 Claude의 확인을 요청), `applied` 피드백 적용(Claude가 읽고 노트에 기록함). |
| `usage` | `text`, `hold` | 쓰임. `hold` 보류, `use` 활용, `revise` 수정 필요, `discard` 폐기. 상태와 별개이다. |
| `revised_from` | `text`, `''` | 수정본일 때 원래 문항의 `id`. 원래 문항이 아니면 `''`. |
| `status` | `text`, `draft` | v1의 옛 칸. 앱은 더 이상 쓰지 않으며, 값은 그대로 둔다. |
| `feedback` | `text`, `''` | 애쉬가 앱에서 남긴 피드백. Claude는 최신 피드백을 먼저 읽고, 문항 수정 시 이 칸을 임의로 지우지 않는다. |

`related`/`based_on`은 간단한 참조 목록이며 DB 외래키로 강제하지 않는다.
노트와 문항의 ID가 헷갈리지 않도록 각각 `note-`, `item-` 접두사를 권장한다.
연결은 같은 `user_id` 안에서만 해석한다. JSON `extra`의 기존 키는 수정 목적과
관계없는 값을 보존한다. `choices`의 모든 항목은 문자열, `figures`의 모든 항목은
`svg`와 `caption` 문자열을 가진 객체여야 한다.

### 문항의 상태와 쓰임 처리 (Claude)

완성된 문항은 `review_state = 'applied'` 그리고 `usage = 'use'`인 문항이다.
앱에서 애쉬가 피드백, 쓰임, 난이도를 바꿔 저장하면 `review_state`는 `feedback`이 된다.
Claude는 문항을 만들거나 매일 정기 점검을 할 때 `review_state = 'feedback'`인 문항을 모두 처리한다.

1. 피드백·쓰임·난이도 판단을 읽고, 배울 점을 `edu_notes`에 기록한다(보통 `kind = 'feedback'` 또는 `rule`).
2. `usage`에 따라 처리한다.
   - `revise` 수정 필요: 피드백대로 고친 문항을 새 행으로 만든다. 새 행은 `review_state = 'unreviewed'`,
     `usage = 'hold'`, `revised_from = 원래 id`. 그다음 원래 문항을 `usage = 'discard'`로 바꾼다.
     원래 문항은 애쉬가 앱에서 지운다. 지워진 원래 문항은 수정본에 "삭제됨"으로 보인다.
   - `discard` 폐기: 행을 지우지 않는다. 삭제는 애쉬가 앱에서 한다.
   - `hold`, `use` 등: 쓰임은 그대로 둔다.
3. 원래 문항을 `review_state = 'applied'`로 바꾼다. 애쉬의 `feedback` 글은 지우지 않는다.

모든 수정은 아래 revision 규칙을 따른다. 애쉬가 같은 문항을 다시 고치면 다시 `feedback`이 된다.

### 제작 원칙

`edu_notes`의 `kind = 'principle'` 행이다. 앱의 **제작 원칙** 탭에서 애쉬가 추가·수정·삭제하며,
`created_at` 순서로 표시된다. Claude는 문항을 만들기 전에 모든 원칙을 가장 먼저 읽고 따른다.
앱이 새로 만들 수 있는 노트는 원칙뿐이고, 다른 종류의 노트는 Claude가 기록한다.

### 수식과 SVG 작성 규칙

본문 안의 수식은 `$v_0^2 = 2as$`처럼 `$...$`, 독립된 수식은 다음처럼 `$$...$$`로 쓴다.

```markdown
운동량 보존 법칙을 적용한다.

$$
v = \frac{m_1v_1 + m_2v_2}{m_1 + m_2}
$$
```

위첨자 `x^2`, 아래첨자 `v_0`, 분수 `\frac{a}{b}`, 그리스 문자 `\Delta` 등을 쓴다.
SQL의 달러 인용 문자열(`$body$...$body$`)에서는 역슬래시를 그대로 쓸 수 있다.
JSON 문자열에 수식을 넣으면 JSON 규칙에 따라 역슬래시를 두 번 쓴다 (`\\frac`).
HTML에 의존하지 말고 마크다운과 수식을 사용한다.

SVG는 `xmlns="http://www.w3.org/2000/svg"`, `viewBox`를 가진 완결된 `<svg>`로 작성한다.
표시할 텍스트와 선을 SVG 안에 넣고 `caption`에 그림 의미를 적는다.
앱은 SVG를 안전하게 정리한 뒤 이미지로 표시한다. 스크립트, 이벤트 속성,
`foreignObject`, 외부 URL/폰트/이미지에 의존하는 그림은 사용하지 않는다.

### Claude의 직접 SQL 기록 예시

서비스 권한은 RLS를 우회하므로 **매 쿼리에 애쉬의 실제 `user_id`를 명시**한다.
서비스 키를 HUB 프런트엔드, 저장소, 문항 본문에 넣지 않는다.
아래의 `00000000-0000-0000-0000-000000000000`은 애쉬의 UUID로 바꿔야 하는 예시다.
UUID는 Supabase의 Authentication → Users에서 해당 계정의 User UID를 복사한다.

```sql
insert into public.edu_notes
  (user_id, id, kind, title, body, scope, tags, source)
values (
  '00000000-0000-0000-0000-000000000000'::uuid,
  'note-momentum-001', 'rule', '충돌 전후의 계를 분명히 제시',
  $body$외력이 무시되는 조건을 문제에 적고, 운동량 보존을 쓰는 계를 설명한다.
식은 $m_1v_1 + m_2v_2 = (m_1+m_2)v$로 표현한다.$body$,
  '물리학Ⅰ > 역학 > 운동량 보존', array['역학', '충돌'], '애쉬 피드백'
)
returning id, revision, created_at, updated_at;

insert into public.edu_items
  (user_id, id, title, subject, unit, difficulty, question_type,
   stem, choices, answer, explanation, figures, based_on)
values (
  '00000000-0000-0000-0000-000000000000'::uuid,
  'item-momentum-001', '완전 비탄성 충돌', '물리학Ⅰ', '역학 > 운동량 보존', '중', '객관식',
  $stem$수평면에서 질량이 같은 두 물체 중 하나가 $4\,\mathrm{m/s}$로 움직이고,
다른 하나는 정지해 있다. 두 물체가 충돌하여 붙은 뒤의 속력은?
충돌 과정에서 두 물체가 이루는 계에 작용하는 외력은 무시한다.$stem$,
  '["1 m/s", "2 m/s", "3 m/s", "4 m/s", "8 m/s"]'::jsonb,
  '②', $explanation$운동량 보존으로 $m\times4 = 2mv$이므로 $v=2\,\mathrm{m/s}$이다.$explanation$,
  '[]'::jsonb, array['note-momentum-001']
)
returning id, revision;
```

새 ID에만 `INSERT`를 쓴다. 기존 문항을 바꾸려면 먼저 행과 `revision`을 읽고,
같은 revision일 때만 `UPDATE`한다. `UPSERT`나 무조건 덮어쓰기를 사용하지 않는다.
예를 들어 읽었던 revision이 `3`이면 다음처럼 수정한다.

```sql
select * from public.edu_items
where user_id = '00000000-0000-0000-0000-000000000000'::uuid
  and id = 'item-momentum-001';

update public.edu_items
set stem = $stem$수정된 문제 본문$stem$,
    explanation = $explanation$수정된 해설$explanation$,
    review_state = 'unreviewed', revision = 4
where user_id = '00000000-0000-0000-0000-000000000000'::uuid
  and id = 'item-momentum-001' and revision = 3 and deleted_at is null
returning *;
```

`RETURNING` 결과가 **0행이면 다른 쪽에서 먼저 바꾼 것**이다. 최신 행을 다시 읽고
애쉬의 피드백과 Claude의 변경을 함께 검토한 뒤 필요한 칸만 수정한다.
`revision`을 생략하거나 건너뛰는 수정은 서비스 권한이어도 트리거가 거부한다.
앱의 저장도 revision 검사와 기존 행/수정 내용/최신 행의 3방향 병합을 사용하며,
같은 칸을 서로 다르게 수정한 충돌은 사용자가 검토하도록 안내한다.
노트도 동일한 규칙을 따른다. 삭제/복원도 행의 수정이므로 revision을 올린다.
앱에서 작성 중인 내용은 연구소의 문항/노트 목록을 오가거나 새로고침해도 유지된다.
외부에서 삭제된 기록의 열린 편집창은 내용을 복사할 수 있도록 남지만 저장하지 못한다.
입력 초안은 현재 화면의 메모리에만 남으며 브라우저 종료·계정 전환 후 복원되지 않는다.

```sql
-- revision 4를 읽은 문항을 소프트 삭제. 노트도 같은 방식이다.
update public.edu_items set deleted_at = now(), revision = 5
where user_id = '00000000-0000-0000-0000-000000000000'::uuid
  and id = 'item-momentum-001' and revision = 4
returning id, revision, deleted_at;
-- 복원은 최신 revision을 읽은 뒤 deleted_at = null로 수정한다.
```

물리 `DELETE`는 권한과 트리거로 막는다. 서비스 권한에서도 `DELETE`, `TRUNCATE`,
트리거 비활성화를 사용하지 않는다. 생성된 노트/문항이 있으면 계정 삭제 역시
외래키로 제한되므로 계정의 영구 삭제는 별도의 관리자 작업으로 다룬다.

### Supabase에 처음 적용하는 방법

1. HUB가 연결된 Supabase 프로젝트를 연다.
2. **SQL Editor → New query**를 누른다.
3. 저장소의 `supabase/edu_lab.sql` 전체 내용을 붙여 넣고 **Run**을 누른다. 이어서 `supabase/edu_lab_v2.sql`도 같은 방법으로 실행한다.
4. Table Editor에서 `edu_notes`, `edu_items` 두 표가 만들어졌는지 확인한다.
5. HUB에 로그인하여 **Edu → 문항 연구소 → 새로고침**을 누른다.

이 SQL은 새 테이블/정책/트리거만 만들며 기존 데이터를 옮기거나 채우지 않는다.
같은 파일을 다시 실행해도 기존 연구소 행을 비우지 않는다.
RLS는 로그인 계정의 `user_id`와 일치하는 행만 읽고 쓰게 한다. 비로그인 `anon`은
접근할 수 없고, `authenticated`와 `service_role`에는 읽기/추가/수정 권한만 준다.
수동 새로고침이 외부 SQL 변경을 다시 읽으므로 Realtime 설정은 필수가 아니다.
테이블을 아직 적용하지 않았거나 읽기가 실패하면 앱이 오류를 표시하고 데이터를
초기화하거나 기본값으로 저장하지 않는다.

검증이 필요하면 같은 SQL Editor에서 `supabase/tests/edu_lab_rls.sql` 전체를 실행한다.
HUB에 한 번 로그인한 사용자가 있어야 한다. 소유자/다른 사용자/서비스 역할의 접근,
revision/시각/식별자 검사, 소프트 삭제, 선택지/그림/상태 형식을 확인한다.
성공하면 `PASS`가 나오며 테스트로 추가한 행은 마지막 `ROLLBACK`으로 사라진다.
적용 후에도 앱의 읽기가 거부되면 해당 프로젝트의 Data API가 `public` 스키마를
노출하는지 확인한다. SQL에 테이블 역할별 권한은 이미 포함되어 있다.

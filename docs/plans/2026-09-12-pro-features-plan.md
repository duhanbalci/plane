# Pro özelliklerini sıfırdan yazma planı

Tarih: 2026-09-12. Kapsam: Work Item Types + Custom Properties, Epics,
Work Item Templates, Gantt'ta bağımlılıklar, Nested pages, Page comments,
Workspace Wiki + Collections.

Fork: `duhanbalci/plane` (branch `preview`), Community Edition, AGPL-3.0.
Repoda hiç EE kodu yok (`ee/`, `ce/`, `@/plane-web` alias'ı yok). Yazdığımız
her şey AGPL altında bizim. Plane'in Pro kodunu okumuyoruz, kopyalamıyoruz;
sadece dokümandaki davranışı hedef alıyoruz.

## 0. Keşif özeti: neresi hazır, neresi boş

Kod tarandı; dört özellik için iskelet büyük ölçüde CE'de kalmış. Bu planın
temel taktiği **boş bırakılmış EE dikiş yerlerine (seam) yazmak**, upstream
merge'lerini kolay tutmak.

| Özellik            | CE'de var                                                                                                                                                                                                                                                                                                | Eksik                                                                                                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Work item types    | `IssueType` + `ProjectIssueType` modelleri ve migration'ları, `Issue.type` FK, `Project.is_issue_type_enabled`, public API'de `type_id`, FE `TIssue.type_id`, `TIssueTypeIdentifier`, i18n `work-item-type.json` (en + tr-TR dolu)                                                                       | App API (serializer/view/url), `type_id` liste serializer'larında yok, activity handler yok, filter/group/order allowlist'te yok, FE store/service/dropdown/settings sayfası yok |
| Custom properties  | `EstimatePoint` örüntüsü, `TIssuePropertyValues` stub tipi, issue modal context'inde `issuePropertyValues`/`handleCreateUpdatePropertyValues` hook'ları (no-op), form'da ayrılmış layout slotu                                                                                                           | Üç model (property / option / value), API, FE her şey                                                                                                                            |
| Epics              | `IssueType.is_epic`, `EIssueServiceType.EPICS`, `epicDetail` store, `IssueService`'te `/epics/` URL dalları, `TEpicAnalytics`, `CreateUpdateEpicModal` (boş fragment)                                                                                                                                    | Backend tamamen: `/epics/` endpoint'leri, `is_epic_enabled` kolonu, ana listeden epic dışlama; FE route + modal gövdesi                                                          |
| Templates          | `DraftIssue` + `Description` örüntüsü, modal context'te `workItemTemplateId`/`handleTemplateChange`, i18n `template.json` (project/work_item/page üçü de)                                                                                                                                                | Model, API, store, settings sayfası, modal picker                                                                                                                                |
| Gantt dependencies | `start_before`/`finish_before` relation tipleri DB'de, `expand=issue_relation,issue_related` yolu, `IssueBulkUpdateDateEndpoint`, `enableDependency` prop'u 7 katman aşağı kadar iletilmiş, `getUpdatedPositionAfterDrag(..., ignoreDependencies)` imzası, `ENABLE_ISSUE_DEPENDENCIES=false` kill-switch | Ok çizimi (SVG yok), sürükle-bağla tutamaçları, tarih yayılımı, `TIssueRelationTypes`'a SS/FF tipleri                                                                            |
| Nested pages       | `Page.parent` FK, recursive CTE ile arşiv, silmede çocukları yetim bırakma, PATCH ile `parent` doğrulaması, `PageVersion.sub_pages_data` (hep `{}`)                                                                                                                                                      | Liste `parent__isnull=True` ile çocukları gizliyor, `TPage`'de `parent` yok, taşıma endpoint'i + cycle guard yok, ağaç UI/store yok                                              |
| Wiki + Collections | `Page.workspace` doğrudan FK, `projects` M2M (sıfır proje yasal), `Page.is_global` (kullanılmıyor), `documentType: "workspace_page"` tipi, wiki empty-state görselleri                                                                                                                                   | Workspace-scoped URL/view/permission, live `WorkspacePageService`, `EPageStoreType.WORKSPACE`, route + sidebar, Collection modeli hiç yok                                        |
| Page comments      | Entity-bağımsız `CommentsWrapper` + `TCommentsOperations`, `IssueComment` modeli, `plugins/highlight.ts` decoration örneği, `UniqueID` blok id'leri, navigation pane extension seam'i                                                                                                                    | `PageComment` model/API/store, editörde comment mark'ı, comments paneli                                                                                                          |

### Wiki nedir, neden ayrı iş

CE'de sayfalar **proje**ye bağlı (`/projects/:id/pages`). Wiki = projeye
bağlı olmayan, tüm workspace üyelerinin gördüğü sayfalar; Collections =
bu sayfaları gruplayan klasörler (varsayılan "General" koleksiyonu, sürükle-
bırak, koleksiyon içinde nested page). Bizim ihtiyacımız tam bu: Duploy
dokümanı/karar kayıtları tek projeye ait değil. Teknik olarak Wiki'nin
%70'i "pages'i workspace-scope'ta bir daha sun", %30'u Collections.

## 1. Genel ilkeler

- **Seam'lere yaz.** `apps/web/app/routes/extended.ts`, `EPageStoreType`,
  `TPageExtended`, `IEditorPropsExtended`, `ExtendedBasePage`, live
  `PageService`, `CoreEditorAdditionalExtensions`, `useExtendedEditorProps`,
  `usePagesPaneExtensions`, `issue-modal/provider.tsx`. Upstream bunları
  boş bıraktı; dolduran biz olursak merge çakışması az olur.
- **Migration numarası:** son `0122_...`; yeni işler `0123+`. Her faz kendi
  migration'ı, geri alınabilir.
- **Soft delete konvansiyonu:** unique constraint'ler
  `condition=Q(deleted_at__isnull=True)` ile.
- **Activity:** issue'ya dokunan her yeni alan
  `bgtasks/issue_activities_task.py` `ISSUE_ACTIVITY_MAPPER`'a handler ister,
  yoksa sessizce izlenmez.
- **Allowlist'ler güvenlik sınırı:** `utils/order_queryset.py`
  `ISSUE_GROUP_BY_ALLOWLIST` / `ISSUE_ORDER_BY_ALLOWLIST`, `utils/grouper.py`
  `issue_on_results` `.values(...)`, `IssueSerializer.Meta.fields`. Yeni alan
  dördüne de eklenmezse UI'da görünmez.
- **Sidebar + peek çift:** `issue-detail/sidebar.tsx` ve
  `peek-overview/properties.tsx` ayrı ayrı yazılmış; her property satırı
  ikisine de girer.
- **i18n:** `packages/i18n/src/locales/{en,tr-TR}/…` anahtarları çoğu
  özellik için hazır; önce var olanı kullan, yeni anahtarı en + tr-TR'ye
  birlikte ekle.
- **Test:** backend pytest (`docker-compose-test.yml`), FE `pnpm check`.
  Her fazın sonunda prod'a push (webhook → build → deploy).
- **UI'daki Pro CTA'larını kaldır:** `billing/comparison/plans.tsx` satırları,
  `features-list.tsx` `isPro` rozetleri, `license/modal/*`. Ayrı, küçük PR.

## 2. Faz sırası ve bağımlılık

```
A  Work item types + custom properties   (temel; B ve C buna bağlı)
B  Epics                                  (A'ya bağlı: epic = is_epic type)
C  Work item templates                    (A'ya bağlı: template type + property değerleri taşır)
D  Gantt dependencies                     (bağımsız; A-C ile paralel yapılabilir)
E  Nested pages                           (F'nin ön koşulu)
F  Wiki + Collections                     (E'ye bağlı)
G  Page comments                          (bağımsız; E/F'den sonra daha anlamlı)
```

İki paralel hat: **Hat 1** A → B → C, **Hat 2** E → F → G. D araya sığar.

## 3. Faz A: Work Item Types + Custom Properties

### 3.1 Backend

**Modeller** (`db/models/issue_type.py` genişler, `db/models/__init__.py`'ye
`ProjectIssueType` + yeni üçlü export):

- `IssueType` mevcut. Ekle: hiçbir şey; `level` float zaten var
  (epic=1, task=0 sözleşmesi).
- `IssueProperty(WorkspaceBaseModel)`: `issue_type` FK
  (`related_name="properties"`), `name`, `display_name`, `description`,
  `property_type` (TextChoices: `text | decimal | option | boolean |
datetime | relation`), `relation_type` (`user`; ileride `issue`),
  `is_required`, `is_active` (default True), `is_multi`, `default_value`
  (ArrayField[str]), `settings` (JSONField: text `display_format`
  single/multi/readonly, date `display_format`, decimal `precision`),
  `sort_order` (float, Label'daki save() auto-bump), `logo_props`.
  Unique `(issue_type, name)` deleted_at null.
- `IssuePropertyOption(WorkspaceBaseModel)`: `property` FK
  (`related_name="options"`), `name`, `description`, `logo_props`,
  `is_default`, `is_active`, `sort_order`.
- `IssuePropertyValue(WorkspaceBaseModel)`: `issue` FK
  (`related_name="property_values"`), `property` FK, `value_text`,
  `value_decimal`, `value_boolean`, `value_datetime`, `value_uuid`
  (option id veya user id), `value_option` FK nullable. Çoklu seçim = birden
  fazla satır. Index `(issue, property)`.
- `Project.is_issue_type_enabled` var. Etkinleştirince (tek yön, geri
  alınamaz — dokümandaki davranış) seed: workspace'te "Task"
  (`is_default=True`, level 0) ve "Epic" (`is_epic=True`, level 1) yoksa
  yarat, `ProjectIssueType` satırlarını aç, projedeki `type IS NULL`
  issue'lara Task ata (data migration değil, endpoint içinde toplu UPDATE).

**Migration `0123_issue_properties.py`**: üç tablo + index'ler.

**API** (`app/urls/issue_type.py` yeni, `app/urls/__init__.py`'ye ekle):

```
GET/POST   workspaces/<slug>/issue-types/                         (workspace tipleri)
PATCH/DEL  workspaces/<slug>/issue-types/<id>/
GET/POST   workspaces/<slug>/projects/<pid>/issue-types/           (projeye bağlı; POST = yarat+bağla)
PATCH/DEL  workspaces/<slug>/projects/<pid>/issue-types/<id>/      (is_default, is_active, level)
POST       workspaces/<slug>/projects/<pid>/issue-types/enable/    (feature aç + seed)
GET/POST   workspaces/<slug>/projects/<pid>/issue-types/<id>/properties/
PATCH/DEL  .../properties/<prop_id>/
GET/POST   .../properties/<prop_id>/options/   PATCH/DEL .../options/<opt_id>/
GET        workspaces/<slug>/projects/<pid>/issues/<issue_id>/property-values/
PATCH      aynı: body { "<property_id>": ["v1","v2"] }  → mevcut satırları sil/yaz, activity üret
```

- View: `app/views/issue_type/{base,property,value}.py`, `BaseViewSet`,
  `ProjectBasePermission`, `@allow_permission([ADMIN])` yazma,
  `[ADMIN, MEMBER, GUEST]` okuma. Estimate view'ları örnek.
- Serializer: `app/serializers/issue_type.py` — `IssueTypeSerializer`
  (`project_ids` annotate), `IssuePropertySerializer` (nested `options`),
  `IssuePropertyValueSerializer`. Değer doğrulama: tip uyumu, `is_required`
  (create'te zorunlu), option'ın property'ye ait olması, `is_multi=False`
  iken tek değer.
- **Issue tarafı:**
  - `IssueCreateSerializer.validate`: `type` verilmişse projeye bağlı ve
    aktif mi; verilmemişse projenin `ProjectIssueType.is_default`'u
    (public API'deki `IssueType.is_default` filtresi hatalı, orayı da
    düzelt).
  - `IssueSerializer.Meta.fields` + `grouper.issue_on_results` +
    `IssueDetailSerializer`'a `type_id`.
  - `ISSUE_ACTIVITY_MAPPER["type_id"] = track_issue_type`
    (`track_estimate_points` kalıbı). Property değerleri için yeni olay
    `issue_property.activity.updated` → `ACTIVITY_MAPPER`; her property
    için tek `IssueActivity(field=property.display_name, old/new)`.
  - Filtre: `utils/issue_filters.py`'de `"type"` anahtarı **state type**
    demek, çakışma; yeni anahtar `issue_type` → `filter_issue_type`
    (`type__in`). Rich filter: `utils/filters/filterset.py`'e `type_id`,
    `type_id__in`; FE `WORK_ITEM_FILTER_PROPERTY_KEYS`'e `type_id`.
  - `ISSUE_GROUP_BY_ALLOWLIST` + `ISSUE_ORDER_BY_ALLOWLIST`'e `type_id`.
  - Silme: `IssueProperty` silinince `IssuePropertyValue` cascade;
    dokümandaki "önce deaktive et" uyarısını UI'da göster.

### 3.2 Frontend

- **Tipler** `packages/types/src/issues/issue-types.ts` (yeni):
  `TIssueType`, `TIssueProperty`, `TIssuePropertyOption`,
  `EIssuePropertyType`, `TIssuePropertyValues = Record<propId, string[]>`
  (stub dosyayı gerçek tanımla değiştir), `TIssuePropertyValueErrors`.
- **Service** `core/services/issue/issue-type.service.ts`,
  `issue-property.service.ts`, `issue-property-value.service.ts`.
- **Store** `core/store/issue-types/`: `issue-type.store.ts` (workspace
  `typesMap`, `projectTypeIds` computedFn, `getDefaultTypeId(projectId)`,
  `enableForProject`), `issue-type.ts` sınıfı (`properties: Record`,
  `IssueProperty` sınıfı içinde `options`), estimates store örüntüsü.
  `root.store.ts`'e `issueTypes`, hook `use-issue-types.ts`.
  Issue detail'e `issue-details/property-values.store.ts`
  (`valuesByIssue`, fetch/update).
- **Modal** `issue-modal/provider.tsx` no-op'ları gerçek yap:
  `getIssueTypeIdOnProjectChange` → default type; `issuePropertyValues`
  state; `handlePropertyValuesValidation` → required kontrol, hata map'i;
  `handleCreateUpdatePropertyValues` → issue yaratıldıktan sonra PATCH
  property-values; `getActiveAdditionalPropertiesLength`.
  `form.tsx`: başlık satırına `IssueTypeDropdown`
  (`core/components/dropdowns/issue-type/`), açıklama editörü ile default
  properties arasına `IssueAdditionalProperties` (property_type'a göre
  input: text/textarea, number, option dropdown (tek/çok), boolean toggle,
  date, member dropdown). Tip değişince değerler sıfırlanır (uyarı).
- **Detay** `issue-detail/sidebar.tsx` + `peek-overview/properties.tsx`:
  "Type" satırı (dropdown, değiştirince değerleri sıfırlayan confirm) ve
  labels'tan sonra custom property satırları. `issue-identifier.tsx` tipin
  ikonunu basar (`TIssueTypeIdentifier` hazır).
- **Liste/board:** display property `issue_type` (tipler
  `IIssueDisplayProperties.issue_type` hazır), `group_by: type_id`
  seçeneği, filtre paneline "Type".
- **Settings** `packages/constants/src/settings/project.ts`'e
  `work_item_types` (WORK_STRUCTURE), route
  `app/(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/work-item-types/page.tsx`.
  Sayfa: "Etkinleştir" kartı (geri alınamaz uyarısı) → tip listesi (ad,
  ikon/renk, açıklama, aktif toggle, varsayılan yap, sil) → tip detayında
  property tablosu (ekle/düzenle/sırala/deaktive/sil, option yönetimi).
  `features-list.tsx`'e "Work item types" satırı (isPro=false).
- i18n: `work-item-type.json` anahtarları mevcut; eksikleri en + tr-TR'ye.

### 3.3 Test

- pytest: tip CRUD, enable seed idempotent, default type atama, required
  property create'te 400, multi/single doğrulama, activity satırı, filter
  `issue_type`, group_by `type_id`.
- FE: modal'da tip seçince alanların değişmesi, required hata gösterimi.

## 4. Faz B: Epics

Doküman: Epic = `is_epic=True` bir tip, level 1; iç içe epic yok; çocuklar
`parent` üzerinden; Work Items sayfasında Type filtresi/grubu ile görünür.
FE zaten `/epics/` URL'lerine gidiyor, biz de o sözleşmeye uyalım.

### 4.1 Backend

- Migration `0124_project_is_epic_enabled`: `Project.is_epic_enabled`
  (bool). Activity helper'ı zaten bu adı biliyor.
- **Dışlama:** `IssueViewSet.get_queryset` (`app/views/issue/base.py:218`)
  ve `IssueManager`'a değil, viewset seviyesine
  `.exclude(type__is_epic=True)`; cycle/module/view/spreadsheet/search
  issue listeleri de bu queryset'ten geçiyor mu tek tek kontrol (`grep
Issue.issue_objects` app/views). Draft ve intake'e dokunma.
- **Epic endpoint'leri** `app/views/epic/base.py`, `app/urls/epic.py`:
  ```
  GET/POST  workspaces/<slug>/projects/<pid>/epics/            (type__is_epic=True; aynı filter/grouper)
  GET/PATCH/DEL  .../epics/<id>/
  GET/POST  .../epics/<id>/issues/        (çocuk issue'lar: parent=<id>; POST { issues: [] } → parent ata, activity)
  DELETE    .../epics/<id>/issues/<issue_id>/   (parent'ı null'a çek)
  GET       .../epics/<id>/analytics/      (TEpicAnalytics: state group sayımları + overdue)
  ```
  Create: `type` zorunlu `is_epic` tip; `parent` verilirse 400 (iç içe yok).
  Bir issue'nun parent'ı epic ise ve issue'nun kendisi epic ise 400
  (`SubIssuesEndpoint.post`'a da aynı guard).
- Epic'e custom property izin var (tipin property'leri); A'daki
  property-values endpoint'i issue_id ile çalıştığından değişiklik yok.

### 4.2 Frontend

- `is_epic_enabled` proje feature toggle'ı (`features-list.tsx`),
  `is_issue_type_enabled` şart.
- Route `app/routes/core.ts`: `:workspaceSlug/projects/:projectId/epics`
  ve `/epics/:epicId`; dizinler `(projects)/projects/(detail)/[projectId]/epics/`.
  Sidebar `project-navigation.tsx`'e "Epics" (feature açıksa).
- `components/epic-modal/modal.tsx` gövdesi: issue modal'ın `form.tsx`'i
  `isEpic` prop'uyla (tip dropdown'u epic tiplere kilitli, parent alanı
  gizli, cycle/module yok).
- Liste: `projectEpics` store + `BaseGanttRoot`/list/kanban layout'ları
  `EIssuesStoreType.EPIC` ile zaten parametrik; epic detay sayfasında
  "Work items" sekmesi (çocuk listesi + ekle/çıkar) ve ilerleme çubuğu
  (`/analytics`).
- Issue detay'da parent seçici epic'leri de listeler (ayrı sekme).

## 5. Faz C: Work Item Templates

Doküman: workspace ve proje seviyesinde şablon; başlık, açıklama, tip,
property'ler, state, priority, labels, assignees, modules; opsiyonel
alt work item'lar; create modal'da şablon ikonu → dropdown.

### 5.1 Backend

- Migration `0125_templates`: `Template(WorkspaceBaseModel)`:
  `name`, `description_html`, `template_type` (`workitem | project | page`
  — bugün yalnız `workitem` yazılır), `project` FK nullable (null =
  workspace şablonu), `template_data` JSONField, `is_active`,
  `created_by`. Unique `(workspace, project, template_type, name)`.
- `template_data` şeması (workitem):
  ```json
  {
    "name": "",
    "description_html": "",
    "type_id": null,
    "state_id": null,
    "priority": "none",
    "label_ids": [],
    "assignee_ids": [],
    "module_ids": [],
    "properties": { "<property_id>": ["…"] },
    "sub_work_items": [{ "name": "", "type_id": null, "priority": "", "label_ids": [], "assignee_ids": [] }]
  }
  ```
  Saklanan id'ler silinmiş olabilir; uygulama anında var olmayanlar
  düşürülür (serializer `resolve()` yardımcısı).
- API `app/urls/template.py`:
  ```
  GET/POST  workspaces/<slug>/templates/?type=workitem
  GET/PATCH/DEL  workspaces/<slug>/templates/<id>/
  GET/POST  workspaces/<slug>/projects/<pid>/templates/     (proje + workspace şablonları birlikte listelenir, source alanı)
  GET/PATCH/DEL  .../templates/<id>/
  ```
  Yazma: workspace şablonu workspace ADMIN, proje şablonu proje ADMIN.
- Şablonu uygulama backend'de değil: FE modal formu doldurur, normal
  create + property-values + sub-issue create çağrıları yapar
  (`handleCreateSubWorkItem` hook'u var). Böylece aktör/activity doğru.

### 5.2 Frontend

- Tipler `packages/types/src/templates.ts`, service, store
  `core/store/templates/work-item-template.store.ts`
  (`templatesMap`, `getTemplatesForProject(projectId)` = proje ∪ workspace).
- Modal: başlık satırına şablon ikonu/dropdown; `handleTemplateChange`
  → `reset(formValues)` + `editorRef.setEditorValue(description)` +
  `issuePropertyValues` set + `isApplyingTemplate` (form kilidi). Submit
  sonrası `sub_work_items` için sırayla `createIssue(parent_id)`.
- Settings: workspace `settings/templates` ve proje `settings/projects/[id]/templates`
  (constants `templates` girdisi). Sayfa: liste + "Yeni work item şablonu"
  → şablon formu = issue modal formunun `templateMode` varyantı (submit
  `template_data` üretir), alt work item ekleme listesi.
- i18n `template.json` mevcut.

## 6. Faz D: Gantt bağımlılıkları

Hedef (doküman): FS (blocking/blocked_by), SS (start_before/after),
FF (finish_before/after) ilişkileri çubuklar arası çizgi; ihlal kırmızı;
sürükleyince bağımlılar kayar; çubuktan sürükleyip bağla; iki tarih de
gerekli.

### 6.1 Backend (küçük)

- `relation.py create`: cycle guard (A→B eklerken B'den A'ya
  blocked_by/start/finish zinciri var mı; BFS, 400 `relation_cycle`).
- `delete_issue_relation_activity`: sabit blocked_by↔blocking yerine
  `get_inverse_relation` (SS/FF silme logu yanlış yazıyor).
- `IssueDetailEndpoint` expand payload'ına `start_date`/`target_date`
  ekle (yüklenmemiş karşı uç için sarkan ok gerekmiyor, ama tarih
  doğrulaması için lazım).

### 6.2 Frontend

- `ENABLE_ISSUE_DEPENDENCIES = true` (`packages/constants/src/issue/filter.ts`).
- `TIssueRelationTypes`'a `start_before|start_after|finish_before|finish_after`;
  `REVERSE_RELATIONS`, `ISSUE_RELATION_OPTIONS` (ikon/etiket; i18n
  anahtarları), `useTimeLineRelationOptions` yalnız FS/SS/FF döndürür.
- **Ok katmanı** `gantt-chart/dependencies/`:
  - `dependency-layer.tsx`: `main-content.tsx` içinde `GanttChartBlocksList`
    sonrasına, `itemsContainerWidth` genişliğinde `position:absolute` SVG.
    Kenar listesi = `relationMap`'ten görünür `blockIds` çiftleri
    (karşı uç yüklü değilse atla). Koordinat: x = `block.position.marginLeft
(+width)`, y = `blockIds.indexOf(id) * BLOCK_HEIGHT + 22`. DOM ölçme
    yok, store'dan.
  - Path: FS = A.sağ → B.sol (ortogonal, 3 kırılma), SS = sol→sol, FF =
    sağ→sağ; `<marker>` ok ucu. İhlal (B.start < A.target vb.) →
    `stroke=red`. Hover'da kalınlaş + "kaldır" düğmesi (`removeRelation`).
  - Performans: yalnız görünür satır aralığı ±20 için çiz; `dayWidth`
    değişince yeniden hesap; sürükleme sırasında `updateBlockPosition`
    observer'ıyla anlık.
- **Sürükle-bağla** `helpers/draggable.tsx`: `enableDependency` ile sol/sağ
  uçta hover'da küçük daire; mousedown → store `dependencyDrag =
{fromId, side}` (`getIsCurrentDependencyDragging` gerçek olur, `block.tsx`
  `forceRender` zaten bağlı), geçici çizgi imleci takip eder, hedef bloğun
  ucuna bırakınca `createRelation(from, to, side kombinasyonuna göre tip)`.
- **Tarih yayılımı** `base-timeline.store.ts`: `getUpdatedPositionAfterDrag`
  `ignoreDependencies=false` iken bağımlı grafı (FS: B.start ≥ A.target+1,
  SS: B.start ≥ A.start, FF: B.target ≥ A.target) topolojik dolaşıp ihlal
  edenleri **minimum** kadar ileri iter, süreyi korur; sonucu tek
  `IBlockUpdateDependencyData[]` olarak döndürür → mevcut batch
  `updateIssueDates` gönderir (optimistic + rollback hazır). Alt/üst
  sınır: 200 düğüm, cycle'da dur. Modifier tuş (Alt) ile
  `ignoreDependencies=true`.
- Issue detay relation seçicisine yeni tipler (mevcut UI listeyi tipten
  türetiyor).

## 7. Faz E: Nested pages

### 7.1 Backend

- `PageSerializer`: `parent` zaten var; ekle `sort_order`, `sub_pages_count`
  (annotate `Count("child_page", filter=deleted_at null & archived null)`).
- `PageViewSet.get_queryset` ve `summary`: `parent__isnull=True` filtresini
  `?parent=<id|root|all>` parametresine bağla (varsayılan `all`; liste
  ağaç kurmak için düz liste + parent id yeterli).
- `POST .../pages/<id>/move/ { parent: <id|null>, sort_order?: float,
project_id?: uuid }`: cycle guard (recursive CTE ile hedef, kaynağın
  torunu mu), aynı workspace, arşivli parent'a taşıma yasak; `sort_order`
  kardeşler arası (65535 aralıklı).
- Silme: mevcut "çocukları yetim bırak" davranışı kalsın; `?cascade=true`
  ile alt ağacı sil (CTE).
- `page_version_task.py` `sub_pages` = çocuk id/isim listesi (snapshot).
- Duplicate: `?include_children=true` ile ağaç kopyala.
- `page_transaction_task` `COMPONENT_MAP`'e `page-embed-component`
  (editör düğümü için back-link, `PageLog.entity_type="page_embed"`).

### 7.2 Frontend

- `TPageExtended` → `{ parent_id: string|null; sort_order: number;
sub_pages_count: number }`.
- `project-page.store.ts`: `getChildPageIds(parentId)` computedFn,
  `movePageInTree(pageId, parentId, index)`, `fetchSubPages(parentId)`.
- Liste `components/pages/list/`: satırlar ağaç (▶ collapse, indent),
  drag-and-drop ile taşı (pragmatic-dnd sidebar'da zaten var), "+" ile alt
  sayfa. Detay başlığında breadcrumb (parent zinciri).
- Editör: `packages/editor/src/extensions/page-embed/` — `/page` slash
  komutu: yeni alt sayfa yaratır + `pageEmbed` atom düğümü (`data-page-id`,
  başlık canlı `pageStore`'dan). Kayıt `document-extensions.tsx`
  registry'sine; HTML↔binary dönüşümü ortak şemadan geçtiği için düğüm
  `@plane/editor` içinde tanımlanır (live server aynı şemayı yükler).
  Tıklama → sayfaya git. Düğüm silinince sayfa silinmez.
- Arşiv: parent arşivlenince çocuklar (CTE) — UI'da rozet.

## 8. Faz F: Wiki + Collections

### 8.1 Backend

- Migration `0126_wiki`: `Page.is_global` yeniden anlamlandır = workspace
  sayfası. Yeni `PageCollection(WorkspaceBaseModel)`: `name`, `description`,
  `logo_props`, `access` (public/private), `owned_by`, `sort_order`,
  `is_default` (General). `Page.collection` FK nullable (yalnız
  `is_global=True` iken dolu). Workspace yaratılınca "General" seed
  (`workspace_seed_task` + mevcut workspace'ler için data migration).
- Permission `WorkspacePagePermission`: workspace üyesi okur; yazma
  `access=public` ise ADMIN/MEMBER, `private` ise owner + workspace admin.
  Guest: yalnız kendi yarattığı.
- URL'ler `app/urls/page.py` (workspace bloğu):
  ```
  GET/POST  workspaces/<slug>/pages/                 (is_global=True)
  GET/PATCH/DEL  workspaces/<slug>/pages/<id>/  + archive/lock/access/description/versions/duplicate/move
  GET/POST  workspaces/<slug>/page-collections/   GET/PATCH/DEL .../<id>/
  POST      workspaces/<slug>/pages/<id>/move/ { collection, parent, sort_order }
  ```
  Uygulama: `PageViewSet`'i `scope` parametresiyle (`project|workspace`)
  tek sınıfta tut; `get_queryset` scope'a göre `projects__project_projectmember`
  yerine `workspace__workspace_member` join'i; `PageSerializer.create`
  `project_id` yoksa `ProjectPage` yazmaz, `is_global=True` + collection
  (verilmezse General).
- Search `filter_pages` + workspace `query_type=page` dalı: join'i
  gevşet (`Q(projects__…) | Q(is_global=True)`).
- `recent_visited_task` / favorites `project_id=None` ile çalışıyor;
  doğrula.
- Live: `apps/live/src/services/page/workspace-page.service.ts`
  (`basePath=/api/workspaces/${slug}`), `handler.ts`'e `workspace_page`
  dalı, `TDocumentTypes` genişlet, pdf-export aynı.

### 8.2 Frontend

- Route `extended.ts`'e: `:workspaceSlug/wiki`, `/wiki/:pageId`,
  `/wiki/collections/:collectionId`. Sidebar
  `WORKSPACE_SIDEBAR_STATIC_NAVIGATION_ITEMS`'a `wiki` (i18n
  `sidebar.wiki`), `"wiki"` reserved slug listesine.
- `EPageStoreType.WORKSPACE`; `core/store/pages/workspace-page.store.ts`
  (`ProjectPageStore` ile ortak taban çıkar: `BasePageStore<T>`),
  `workspace-page.ts` (`BasePage` + `TBasePageServices` workspace service
  ile), `core/services/page/workspace-page.service.ts`.
- Wiki sayfası layout: sol panel = koleksiyonlar (▶ açılır) → sayfa ağacı
  (E'deki ağaç bileşeni yeniden kullanılır) + arama; sağ = editör
  (`editor-body.tsx`, `documentType: "workspace_page"`). Koleksiyon
  oluştur/adlandır/sil (silince sayfalar General'e), sayfayı koleksiyonlar
  arası sürükle (`move`). Empty-state görselleri `assets/empty-state/wiki/`.
- Proje sayfasını Wiki'ye taşı: `move { project_id: null, collection }`
  (mevcut `movePage`'in genelleştirilmesi).
- Power-K / arama sonuçlarında wiki sayfaları (`getRedirectionLink`).

## 9. Faz G: Page comments (inline)

Doküman: metin seç → toolbar'da yorum ikonu → sağ panel; thread, reply,
@mention, resolve/unresolve, filtre (active/resolved/all), görsel ek.

### 9.1 Backend

- Migration `0127_page_comments`: `PageComment(WorkspaceBaseModel)`
  (`IssueComment` kalıbı, proje yok): `page` FK, `actor`, `comment_html /
json / stripped`, `attachments`, `parent` (reply), `anchor` JSONField
  `{ mark_id, block_id, quoted_text }`, `is_resolved`, `resolved_by`,
  `resolved_at`, `edited_at`. `PageCommentReaction`.
- API `workspaces/<slug>/[projects/<pid>/]pages/<page_id>/comments/`
  (list `?resolved=`, create), `.../comments/<id>/` (patch/delete),
  `.../comments/<id>/resolve/` (post/delete), reactions.
  İzin: sayfayı görebilen yorumlar; guest yalnız kendi sayfası.
- Mention → mevcut notification task (`issue_comment` kalıbı, yeni
  `page_comment` entity).

### 9.2 Editör + FE

- `packages/editor/src/extensions/comment-mark/`: Tiptap `Mark`
  `comment` (`data-comment-id`, birden fazla id için virgüllü), `@plane/editor`
  çekirdek listesinde (HTML↔binary ve PDF şeması ortak; `mark-renderers.ts`
  düz metin olarak geçirir). Bubble menu'ye "Comment" düğmesi
  (`extendedEditorProps.comments.onCreate(range) → mark_id`). Aktif thread
  vurgusu `plugins/highlight.ts` decoration'ı ile.
- Panel: `usePagesPaneExtensions` → `navigationPaneExtensions`'a
  `{ id: "comments", triggerParam: "comments", component:
PageCommentsPane }`; içinde `CommentsWrapper` (`TCommentsOperations`'ı
  page servisine bağlayan `usePageCommentOperations`), thread kartı
  başında `quoted_text`, resolve butonu, filtre. Karta tıkla → editörde
  mark'a scroll + highlight; mark'a tıkla → panelde thread.
- Mark silinmiş metinle giderse thread "bağlantısız" rozetiyle kalır
  (anchor.block_id ile yaklaşık yer).
- Store `core/store/pages/page-comments.store.ts`, service
  `page-comment.service.ts`.

## 10. Kaba iş yükü ve sıra

| Faz | Backend | Frontend | Not                                   |
| --- | ------- | -------- | ------------------------------------- |
| A   | 3 gün   | 5 gün    | En büyük; B ve C'nin temeli           |
| B   | 1.5 gün | 2 gün    | Dışlama kontrolü dikkatli             |
| C   | 1 gün   | 2 gün    |                                       |
| D   | 0.5 gün | 3 gün    | Yayılım algoritması + SVG             |
| E   | 1 gün   | 2.5 gün  | page-embed düğümü şemaya girer        |
| F   | 2 gün   | 3 gün    | Permission + live service             |
| G   | 1 gün   | 3 gün    | Mark şemaya girer, live/PDF etkilenir |

Önerilen başlangıç: **A** (Hat 1) ve **E** (Hat 2) paralel; A bittikten
sonra B→C, E bittikten sonra F→G; D boşluklara.

## 11. Riskler

- **Şema değişikliği yapan editör düğüm/mark'ları** (page-embed, comment)
  live server ve PDF export ile aynı `@plane/editor` listesinden gelmeli;
  yoksa live her kaydetmede siler.
- **Epic dışlama** eksik kalırsa epic'ler her listede görünür; tüm
  `Issue.issue_objects` kullanıcılarını grep'le.
- **`type` filtre anahtarı** state type demek; work item type için
  `issue_type`/`type_id`.
- **Upstream merge:** seam dosyalarına yazdığımız için upstream bunları
  doldurmaz; ama `PageViewSet`, `IssueViewSet`, `form.tsx` gibi çekirdek
  dosyalarda çakışma olacak. Değişiklikleri küçük, konu başına tut.
- **Prod veri:** her faz ayrı migration; enable akışları idempotent.

## 12. Faz H: Editör dosya eki (attachment) bloğu + external embed

CE'de iskelet var: `packages/editor/src/plugins/drop.ts` `fileType ===
"attachment"` dalı boş, `ACCEPTED_ATTACHMENT_MIME_TYPES` ve `TEditorCommands`
`"attachment"` mevcut, i18n `editor.json` `attachmentComponent.*` hazır.
Düğüm, node view ve upload akışı yok.

- `packages/editor/src/extensions/attachment/`: atom blok düğümü
  `attachment` (attrs `src`, `id` (asset id), `name`, `size`, `mime`),
  HTML `<attachment-component …>`; node view = kart (mime ikonu, ad, boyut,
  indir/aç, silme), yükleme sırasında progress; upload `fileHandler.upload`
  (custom-image ile aynı yol, sayfa/issue asset endpoint'i zaten var),
  `fileHandler.delete` düğüm silinince. `insertAttachmentComponent` komutu;
  drop/paste dalı doldurulur; `/attachment` slash komutu ("File").
  Çekirdek extension listesine (live/PDF şeması). PDF export'ta bağlantı
  olarak render.
- `page_transaction_task` `COMPONENT_MAP`'e `attachment-component` →
  `PageLog` (asset back-link), asset GC mevcut image akışıyla aynı.
- **External embed** (opsiyonel, i18n `externalEmbedComponent.*` hazır):
  `externalEmbed` düğümü, link yapıştırınca "Link / Rich card / Embed"
  seçeneği; YouTube/Figma/Google Docs için iframe allowlist'i; oEmbed
  yok, sabit sağlayıcı kalıpları.
- Yük: attachment 2 gün, external embed 1.5 gün. Sıra: G'den sonra.

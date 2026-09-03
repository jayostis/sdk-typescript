/**
 * The rows exact local-name lookup cannot answer, each with its reason.
 *
 * Applied by the CALLER of {@link deriveRecordTypes}, not passed into it — the
 * derivation reports what it could not resolve and this is what the answer is.
 * A test therefore reads the same `unresolved` the committed table was built
 * from, rather than a code path nothing else takes.
 *
 * @module record-types
 */

/**
 * Name → the class it is written as, where derivation reports it unresolved.
 *
 * Every entry must be justified by something an ontology says, not by a
 * convention, because a convention is a rule and a rule this small should be
 * six written lines instead.
 */
export const RDF_TYPE_OVERRIDES: Readonly<Record<string, string>> = {
  // The SDK's type name carries a `Record` suffix the class does not. A suffix
  // rule would absorb both of these and then be wrong the first time a class is
  // genuinely named `*Record` — `health:` declares eleven that are.
  MedicationRecord: 'clinical:Medication',
  ProcedureRecord: 'clinical:Procedure',

  // The one local name two vocabularies both declare, so lookup has two
  // candidates and no way to choose. `health:` is consumer-reported;
  // `clinical:` is EHR-extracted from a C-CDA Social History section
  // (`clinical.ttl:2113`), with its own consent scope and its own pod path.
  SocialHistoryRecord: 'health:SocialHistoryRecord',
  ClinicalSocialHistoryRecord: 'clinical:SocialHistoryRecord',

  // Not an `owl:Class` at all — `core.ttl:1289` declares it an
  // `owl:NamedIndividual`, so a class index does not contain it. See #43, which
  // asks whether this should be a record type in the first place.
  SocialHistoryConsent: 'cascade:SocialHistoryConsent',

  // An exact local-name match EXISTS and must not be taken. `clinical.ttl:185`
  // declares `clinical:CoverageRecord`, deprecated since v1.5 in favour of
  // `coverage:InsurancePlan`, and #26 is the change that stopped this SDK
  // writing it. The name survives as an accepted INPUT spelling, so it has to
  // resolve to something; it resolves to the class that superseded it, and the
  // deprecated spelling stays readable through `acceptedClassUris`.
  //
  // NOT IN #42's LIST OF FIVE, and the difference is a measurement rather than
  // a judgement: #42 recorded `CoverageRecord` as deriving cleanly. It does
  // not. The class is marked `owl:deprecated "true"^^xsd:boolean` — the long
  // spelling — where the four v1.13 deprecations use the bare `true`, so a
  // detector matching only the short form calls this class live and derives
  // straight back into #26.
  CoverageRecord: 'coverage:InsurancePlan',
};

/**
 * Where several names reach one class, the spelling a read RETURNS.
 *
 * `alias -> canonical`. Every other accepted name maps to itself.
 *
 * THE RULE IS THE MODEL'S OWN LITERAL, not a corpus vote and not source order.
 * `src/models/procedure.ts` declares `type: 'Procedure'` as a single string
 * literal; `'ProcedureRecord'` is not a member of it, there is no
 * `ProcedureRecord` interface and nothing is exported under that name. A
 * deserializer returning it hands back a value this package's own published
 * type says is impossible, which a TypeScript consumer cannot even write the
 * branch for. So this is not a rename — it honours a contract the runtime has
 * been violating.
 *
 * The corpus corroborates rather than decides: all four `proc-*` fixtures carry
 * `Procedure` in both `type` and `dataType`, and none carries `ProcedureRecord`.
 * Where the two could conflict the model wins, because it is the published
 * contract and a fixture is not.
 */
export const CANONICAL_NAMES: Readonly<Record<string, string>> = {
  Medication: 'MedicationRecord',
  ProcedureRecord: 'Procedure',
  CoverageRecord: 'InsurancePlan',
};

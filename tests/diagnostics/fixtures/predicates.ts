/**
 * A stand-in for `src/vocabularies/namespaces.ts`, in the same syntactic shape.
 *
 * `declared-predicate-not-in-ontology` cross-references the SDK's registered
 * predicates against the ontology; this file is what `CASCADE_PREDICATES_FILE`
 * points the generator at so every case can be seeded. Only the two exports the
 * detector reads are here, written the way the real file writes them, so
 * whatever reads the real file reads this one.
 */

export const NAMESPACES = {
  /** Cascade Protocol core vocabulary (v1). */
  cascade: 'https://ns.cascadeprotocol.org/core/v1#',
  /** Cascade Protocol clinical vocabulary (v1). */
  clinical: 'https://ns.cascadeprotocol.org/clinical/v1#',
  /** Cascade Protocol evidence vocabulary (v1-draft): no ontology ships for it. */
  evidence: 'https://ns.cascadeprotocol.org/evidence/v1#',
  /** Cascade Protocol workbench vocabulary (v1-draft): no ontology ships for it. */
  workbench: 'https://ns.cascadeprotocol.org/workbench/v1#',
  /** FOAF. */
  foaf: 'http://xmlns.com/foaf/0.1/',
} as const;

export const PROPERTY_PREDICATES: Record<string, string> = {
  // Present in the fixture ontology as a datatype property: nothing to report.
  present: 'cascade:present',
  // Absent from the ontology and from every context: the SDK's alone.
  ghost: 'cascade:ghost',
  // Absent from the ontology, present in a context: both sides claim it.
  contextOnly: 'clinical:contextOnly',
  // In scope only where the fixture ships an `owl:Ontology` for the namespace:
  // the test gives `evidence` one that declares nothing, so this is reported.
  direction: 'evidence:direction',
  // Out of scope: no ontology declares these namespaces.
  filingLabel: 'workbench:filingLabel',
  name: 'foaf:name',
  // Present in the ontology only as owl:AnnotationProperty: still present.
  annotated: 'cascade:annotated',
};

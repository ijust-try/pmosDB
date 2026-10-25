/**
 * CENTRAL DEMONSTRATION DATASET
 * ------------------------------------------------------------------
 * This is the ONLY file that contains mock records. UI components never import it;
 * they go through `src/services/repository.ts`.
 *
 * Provenance policy
 *  - `project-document`: the fact/identifier appears in the PMOS project progress document
 *    (CYP17A1 / NCBI Gene 1586 / UniProt P05093 / metformin / PubChem CID 4091, the
 *    CYP17A1 rs743572 publication title, and the entity relationships it describes).
 *  - `unverified-demo`: illustrative record added so the interface can be demonstrated.
 *    Identifiers marked this way MUST be validated against the source database during
 *    backend integration. They are shown with a visible warning in the UI.
 *  - No PMIDs, authors, years, evidence scores or reaction sequences are invented. Fields
 *    that are not known are `null` / omitted.
 */
import type {
  Annotation,
  DataSource,
  Entity,
  RelationLabel,
  Relationship,
  RelationStatus,
  SourceRef,
  Verification,
} from '../types';

const DOC: Verification = 'project-document';
const DEMO: Verification = 'unverified-demo';

const ann = (label: string, value: string, verification: Verification): Annotation => ({
  label,
  value,
  verification,
});

const ncbi = (id: string, verification: Verification): SourceRef => ({
  source: 'ncbi-gene',
  accession: id,
  url: verification === DOC ? `https://www.ncbi.nlm.nih.gov/gene/${id}` : undefined,
  verification,
});
const uniprot = (acc: string, verification: Verification): SourceRef => ({
  source: 'uniprot',
  accession: acc,
  url: verification === DOC ? `https://www.uniprot.org/uniprotkb/${acc}` : undefined,
  verification,
});
const pubchem = (cid: string, verification: Verification): SourceRef => ({
  source: 'pubchem',
  accession: cid,
  url: verification === DOC ? `https://pubchem.ncbi.nlm.nih.gov/compound/${cid}` : undefined,
  verification,
});

export const ENTITIES: Entity[] = [
  // ───────────── Genes ─────────────
  {
    id: 'gene-cyp17a1',
    type: 'gene',
    name: 'CYP17A1',
    symbol: 'CYP17A1',
    organism: 'Homo sapiens',
    primaryId: '1586',
    idLabel: 'NCBI Gene ID',
    aliases: ['CYP17', 'P450c17', 'Cytochrome P450 family 17 subfamily A member 1'],
    description:
      'Representative gene in the PMOS knowledge base because of its role in steroid hormone related processes. Encodes steroid 17-alpha-hydroxylase/17,20-lyase.',
    sources: [ncbi('1586', DOC)],
    annotations: [
      ann('Gene name', 'Cytochrome P450 Family 17 Subfamily A Member 1', DOC),
      ann('Functional context', 'Steroid hormone related processes', DOC),
    ],
    verification: DOC,
  },
  {
    id: 'gene-cyp11a1',
    type: 'gene',
    name: 'CYP11A1',
    symbol: 'CYP11A1',
    organism: 'Homo sapiens',
    primaryId: '1583',
    idLabel: 'NCBI Gene ID',
    aliases: ['P450scc'],
    description: 'Illustrative steroidogenic gene included to demonstrate gene → protein → pathway navigation.',
    sources: [ncbi('1583', DEMO)],
    annotations: [],
    verification: DEMO,
  },
  {
    id: 'gene-cyp19a1',
    type: 'gene',
    name: 'CYP19A1',
    symbol: 'CYP19A1',
    organism: 'Homo sapiens',
    primaryId: '1588',
    idLabel: 'NCBI Gene ID',
    aliases: ['Aromatase gene'],
    description: 'Illustrative steroidogenic gene included to demonstrate gene → protein → pathway navigation.',
    sources: [ncbi('1588', DEMO)],
    annotations: [],
    verification: DEMO,
  },
  {
    id: 'gene-ar',
    type: 'gene',
    name: 'AR',
    symbol: 'AR',
    organism: 'Homo sapiens',
    primaryId: '367',
    idLabel: 'NCBI Gene ID',
    aliases: ['Androgen receptor gene'],
    description: 'Illustrative gene for the androgen receptor, included to connect receptor biology to hormones.',
    sources: [ncbi('367', DEMO)],
    annotations: [],
    verification: DEMO,
  },
  {
    id: 'gene-amh',
    type: 'gene',
    name: 'AMH',
    symbol: 'AMH',
    organism: 'Homo sapiens',
    primaryId: '268',
    idLabel: 'NCBI Gene ID',
    aliases: ['Anti-Müllerian hormone gene', 'MIS'],
    description: 'Illustrative gene encoding anti-Müllerian hormone, linked to the AMH biomarker record.',
    sources: [ncbi('268', DEMO)],
    annotations: [],
    verification: DEMO,
  },
  {
    id: 'gene-insr',
    type: 'gene',
    name: 'INSR',
    symbol: 'INSR',
    organism: 'Homo sapiens',
    primaryId: '3643',
    idLabel: 'NCBI Gene ID',
    aliases: ['Insulin receptor gene'],
    description: 'Illustrative gene for the insulin receptor, included to represent the metabolic arm of the knowledge base.',
    sources: [ncbi('3643', DEMO)],
    annotations: [],
    verification: DEMO,
  },

  // ───────────── Proteins ─────────────
  {
    id: 'protein-cyp17a1',
    type: 'protein',
    name: 'Steroid 17-alpha-hydroxylase/17,20-lyase',
    geneSymbol: 'CYP17A1',
    primaryId: 'P05093',
    idLabel: 'UniProt accession',
    aliases: ['CYP17A1 protein', 'CYP17'],
    description: 'Protein product of CYP17A1, as referenced in the project document.',
    sources: [uniprot('P05093', DOC)],
    annotations: [ann('Protein name', 'Steroid 17-alpha-hydroxylase/17,20-lyase', DOC)],
    verification: DOC,
  },
  {
    id: 'protein-cyp11a1',
    type: 'protein',
    name: 'Cholesterol side-chain cleavage enzyme',
    geneSymbol: 'CYP11A1',
    primaryId: 'P05108',
    idLabel: 'UniProt accession',
    aliases: ['CYP11A1 protein', 'P450scc'],
    description: 'Illustrative protein record for CYP11A1.',
    sources: [uniprot('P05108', DEMO)],
    annotations: [],
    verification: DEMO,
  },
  {
    id: 'protein-cyp19a1',
    type: 'protein',
    name: 'Aromatase',
    geneSymbol: 'CYP19A1',
    primaryId: 'P11511',
    idLabel: 'UniProt accession',
    aliases: ['CYP19A1 protein'],
    description: 'Illustrative protein record for CYP19A1.',
    sources: [uniprot('P11511', DEMO)],
    annotations: [],
    verification: DEMO,
  },
  {
    id: 'protein-ar',
    type: 'protein',
    name: 'Androgen receptor',
    geneSymbol: 'AR',
    primaryId: 'P10275',
    idLabel: 'UniProt accession',
    aliases: ['AR protein'],
    description: 'Illustrative protein record for the androgen receptor.',
    sources: [uniprot('P10275', DEMO)],
    annotations: [],
    verification: DEMO,
  },
  {
    id: 'protein-amh',
    type: 'protein',
    name: 'Anti-Müllerian hormone (protein)',
    geneSymbol: 'AMH',
    primaryId: 'P03971',
    idLabel: 'UniProt accession',
    aliases: ['Müllerian-inhibiting substance', 'AMH protein'],
    description: 'Illustrative protein record for AMH.',
    sources: [uniprot('P03971', DEMO)],
    annotations: [],
    verification: DEMO,
  },
  {
    id: 'protein-insr',
    type: 'protein',
    name: 'Insulin receptor',
    geneSymbol: 'INSR',
    primaryId: 'P06213',
    idLabel: 'UniProt accession',
    aliases: ['INSR protein'],
    description: 'Illustrative protein record for the insulin receptor.',
    sources: [uniprot('P06213', DEMO)],
    annotations: [],
    verification: DEMO,
  },

  // ───────────── Hormones ─────────────
  {
    id: 'hormone-testosterone',
    type: 'hormone',
    name: 'Testosterone',
    primaryId: '6013',
    idLabel: 'PubChem CID',
    aliases: ['Androgen'],
    description:
      'Representative hormone in the project, related to androgen activity and androgen related biological processes.',
    chemicalClass: 'Steroid',
    chemical: { pubchemCid: '6013' },
    sources: [pubchem('6013', DEMO)],
    annotations: [
      ann('Role in project', 'Hormone related to androgen activity', DOC),
      ann('Molecular formula', 'C19H28O2', DEMO),
    ],
    verification: DEMO,
  },
  {
    id: 'hormone-estradiol',
    type: 'hormone',
    name: 'Estradiol',
    primaryId: '5757',
    idLabel: 'PubChem CID',
    aliases: ['Oestradiol', 'E2'],
    description: 'Illustrative steroid hormone record.',
    chemicalClass: 'Steroid',
    chemical: { pubchemCid: '5757' },
    sources: [pubchem('5757', DEMO)],
    annotations: [ann('Molecular formula', 'C18H24O2', DEMO)],
    verification: DEMO,
  },
  {
    id: 'hormone-lh',
    type: 'hormone',
    name: 'Luteinizing hormone',
    primaryId: 'Identifier pending',
    idLabel: 'Awaiting source mapping',
    aliases: ['LH', 'Lutropin'],
    description: 'Illustrative peptide hormone record; no source identifier has been mapped yet.',
    chemicalClass: 'Peptide hormone',
    sources: [],
    annotations: [],
    verification: DEMO,
  },
  {
    id: 'hormone-insulin',
    type: 'hormone',
    name: 'Insulin',
    primaryId: 'Identifier pending',
    idLabel: 'Awaiting source mapping',
    aliases: [],
    description: 'Illustrative peptide hormone record; no source identifier has been mapped yet.',
    chemicalClass: 'Peptide hormone',
    sources: [],
    annotations: [],
    verification: DEMO,
  },

  // ───────────── Biomarkers ─────────────
  {
    id: 'biomarker-amh',
    type: 'biomarker',
    name: 'Anti-Müllerian hormone (AMH)',
    primaryId: 'AMH',
    idLabel: 'Symbol',
    aliases: ['AMH', 'Anti Mullerian Hormone', 'Müllerian-inhibiting substance'],
    description: 'Considered in the project as a reproductive biomarker.',
    sampleContext: 'Not yet curated',
    sources: [],
    annotations: [ann('Role in project', 'Reproductive biomarker', DOC)],
    verification: DOC,
  },
  {
    id: 'biomarker-shbg',
    type: 'biomarker',
    name: 'Sex hormone-binding globulin (SHBG)',
    primaryId: 'Identifier pending',
    idLabel: 'Awaiting source mapping',
    aliases: ['SHBG'],
    description: 'Illustrative biomarker record; no source identifier has been mapped yet.',
    sampleContext: 'Not yet curated',
    sources: [],
    annotations: [],
    verification: DEMO,
  },

  // ───────────── Pathways ─────────────
  {
    id: 'pathway-steroid-biosynthesis',
    type: 'pathway',
    name: 'Steroid hormone biosynthesis',
    organism: 'Homo sapiens',
    primaryId: 'Reactome ID pending',
    idLabel: 'Awaiting source mapping',
    aliases: ['Steroidogenesis'],
    description:
      'Pathway context for CYP17A1 in the project document. Membership shown here is a simplified relationship summary and not a reaction sequence.',
    sources: [{ source: 'reactome', verification: DEMO }],
    annotations: [ann('Context', 'Steroid hormone biosynthesis and related steroidogenic pathways', DOC)],
    verification: DOC,
  },
  {
    id: 'pathway-insulin-signalling',
    type: 'pathway',
    name: 'Insulin receptor signalling',
    organism: 'Homo sapiens',
    primaryId: 'Reactome ID pending',
    idLabel: 'Awaiting source mapping',
    aliases: ['Insulin signalling'],
    description: 'Illustrative pathway record representing the metabolic arm of the knowledge base.',
    sources: [{ source: 'reactome', verification: DEMO }],
    annotations: [],
    verification: DEMO,
  },

  // ───────────── Therapeutics ─────────────
  {
    id: 'therapeutic-metformin',
    type: 'therapeutic',
    name: 'Metformin',
    primaryId: '4091',
    idLabel: 'PubChem CID',
    aliases: ['Dimethylbiguanide'],
    description:
      'Example therapeutic compound that can be studied through its chemical and biological information. Research record only.',
    chemical: { pubchemCid: '4091' },
    mechanism: null,
    sources: [pubchem('4091', DOC)],
    annotations: [
      ann('Role in project', 'Representative therapeutic compound', DOC),
      ann('Molecular formula', 'C4H11N5', DEMO),
    ],
    verification: DOC,
  },

  // ───────────── Publications ─────────────
  {
    id: 'pub-cyp17a1-rs743572',
    type: 'publication',
    name: 'CYP17A1 rs743572 polymorphism and polycystic ovary syndrome: systematic review and meta-analysis',
    primaryId: 'PMID not yet recorded',
    idLabel: 'PubMed',
    aliases: [],
    description:
      'Title as listed in the project document reference list. Authors, year, journal and PMID have not been recorded yet and will arrive with the PubMed integration.',
    authors: null,
    year: null,
    journal: null,
    pmid: null,
    evidenceCategory: 'literature-reference',
    sources: [{ source: 'pubmed', verification: DOC }],
    annotations: [],
    verification: DOC,
  },

  // ───────────── Biological processes ─────────────
  {
    id: 'process-steroid-biosynthesis',
    type: 'process',
    name: 'Steroid biosynthetic process',
    primaryId: 'GO:0006694',
    idLabel: 'Gene Ontology',
    aliases: [],
    description: 'Illustrative Gene Ontology biological process record.',
    sources: [{ source: 'gene-ontology', accession: 'GO:0006694', verification: DEMO }],
    annotations: [],
    verification: DEMO,
  },
  {
    id: 'process-androgen-biosynthesis',
    type: 'process',
    name: 'Androgen biosynthetic process',
    primaryId: 'GO:0006702',
    idLabel: 'Gene Ontology',
    aliases: [],
    description: 'Androgen related biological process referenced for testosterone in the project document.',
    sources: [{ source: 'gene-ontology', accession: 'GO:0006702', verification: DEMO }],
    annotations: [ann('Context', 'Androgen related biological processes', DOC)],
    verification: DEMO,
  },
  {
    id: 'process-glucose-homeostasis',
    type: 'process',
    name: 'Glucose homeostasis',
    primaryId: 'GO:0042593',
    idLabel: 'Gene Ontology',
    aliases: [],
    description: 'Illustrative metabolic process record.',
    sources: [{ source: 'gene-ontology', accession: 'GO:0042593', verification: DEMO }],
    annotations: [],
    verification: DEMO,
  },
];

let relCounter = 0;
const rel = (
  source: string,
  label: RelationLabel,
  target: string,
  status: RelationStatus,
  note?: string,
): Relationship => ({ id: `rel-${++relCounter}`, source, label, target, status, note });

const D: RelationStatus = 'project-document';
const U: RelationStatus = 'demo-unvalidated';

export const RELATIONSHIPS: Relationship[] = [
  // Stated in project document
  rel('gene-cyp17a1', 'encodes', 'protein-cyp17a1', D, 'Gene → Protein link from the project relationship model.'),
  rel('protein-cyp17a1', 'participates in', 'pathway-steroid-biosynthesis', D, 'Protein → Pathway link from the project relationship model.'),
  rel('hormone-testosterone', 'associated with', 'process-androgen-biosynthesis', D, 'Hormone → Biological process link from the project relationship model.'),
  rel(
    'gene-cyp17a1',
    'supported by',
    'pub-cyp17a1-rs743572',
    D,
    'Publication examines a CYP17A1 polymorphism. This records the study subject, not a causal claim.',
  ),

  // Illustrative / not yet validated
  rel('gene-cyp11a1', 'encodes', 'protein-cyp11a1', U),
  rel('protein-cyp11a1', 'participates in', 'pathway-steroid-biosynthesis', U),
  rel('gene-cyp19a1', 'encodes', 'protein-cyp19a1', U),
  rel('protein-cyp19a1', 'participates in', 'pathway-steroid-biosynthesis', U),
  rel('gene-ar', 'encodes', 'protein-ar', U),
  rel('protein-ar', 'associated with', 'hormone-testosterone', U),
  rel('gene-amh', 'encodes', 'protein-amh', U),
  rel('biomarker-amh', 'associated with', 'protein-amh', U),
  rel('biomarker-shbg', 'associated with', 'hormone-testosterone', U),
  rel('hormone-testosterone', 'associated with', 'pathway-steroid-biosynthesis', U),
  rel('hormone-estradiol', 'associated with', 'pathway-steroid-biosynthesis', U),
  rel('hormone-lh', 'associated with', 'process-androgen-biosynthesis', U),
  rel('pathway-steroid-biosynthesis', 'associated with', 'process-steroid-biosynthesis', U),
  rel('pathway-steroid-biosynthesis', 'associated with', 'process-androgen-biosynthesis', U),
  rel('gene-insr', 'encodes', 'protein-insr', U),
  rel('protein-insr', 'participates in', 'pathway-insulin-signalling', U),
  rel('hormone-insulin', 'associated with', 'pathway-insulin-signalling', U),
  rel('hormone-insulin', 'associated with', 'process-glucose-homeostasis', U),
  rel('pathway-insulin-signalling', 'associated with', 'process-glucose-homeostasis', U),
  rel(
    'therapeutic-metformin',
    'associated with',
    'process-glucose-homeostasis',
    U,
    'Metabolic context only. No target, mechanism or efficacy claim is made.',
  ),
];

export const DATA_SOURCES: DataSource[] = [
  {
    id: 'ncbi-gene',
    name: 'NCBI Gene',
    contributes: 'Gene identifiers, gene names, descriptions, and functional information.',
    entityTypes: ['gene'],
    status: 'demo-data',
    url: 'https://www.ncbi.nlm.nih.gov/gene',
    lastSync: null,
    validationNote: 'Identifier cross-check against NCBI Gene pending.',
  },
  {
    id: 'uniprot',
    name: 'UniProt',
    contributes: 'Protein names, functions, annotations, and identifiers.',
    entityTypes: ['protein'],
    status: 'demo-data',
    url: 'https://www.uniprot.org',
    lastSync: null,
    validationNote: 'Accession cross-check against UniProt pending.',
  },
  {
    id: 'reactome',
    name: 'Reactome',
    contributes: 'Biological pathways and pathway associated genes.',
    entityTypes: ['pathway'],
    status: 'demo-data',
    url: 'https://reactome.org',
    lastSync: null,
    validationNote: 'Pathway identifiers and membership to be imported and validated.',
  },
  {
    id: 'gene-ontology',
    name: 'Gene Ontology',
    contributes: 'Molecular functions and biological processes.',
    entityTypes: ['process'],
    status: 'demo-data',
    url: 'https://geneontology.org',
    lastSync: null,
    validationNote: 'GO term identifiers pending validation.',
  },
  {
    id: 'pubchem',
    name: 'PubChem',
    contributes: 'Chemical and therapeutic information.',
    entityTypes: ['therapeutic', 'hormone'],
    status: 'demo-data',
    url: 'https://pubchem.ncbi.nlm.nih.gov',
    lastSync: null,
    validationNote: 'Compound identifiers and chemical properties pending import.',
  },
  {
    id: 'open-targets',
    name: 'Open Targets',
    contributes: 'Gene and disease associations and supporting evidence.',
    entityTypes: ['gene'],
    status: 'awaiting-integration',
    url: 'https://www.opentargets.org',
    lastSync: null,
    validationNote: 'No records represented yet. Association scoring will be imported with the backend.',
  },
  {
    id: 'pubmed',
    name: 'PubMed',
    contributes: 'Scientific publications and research evidence.',
    entityTypes: ['publication'],
    status: 'demo-data',
    url: 'https://pubmed.ncbi.nlm.nih.gov',
    lastSync: null,
    validationNote: 'Only one title from the project reference list is represented; PMIDs pending.',
  },
];

/** Records featured on the Overview page (ids into ENTITIES). */
export const FEATURED_IDS = [
  'gene-cyp17a1',
  'hormone-testosterone',
  'biomarker-amh',
  'therapeutic-metformin',
  'pathway-steroid-biosynthesis',
];

/** Entity the BioGraph opens on. */
export const DEFAULT_GRAPH_FOCUS = 'gene-cyp17a1';

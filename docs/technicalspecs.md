Technical Specification Document (TSD)

1. Purpose

The purpose of the following technical specification document is to thoroughly breakdown each feature deliverable’s specifications. Each feature will be broken down with a description to specify the purpose of the feature, the technological components required for the feature to be built, the pseudocode logic flow to explain how the feature will be implemented, the configuration details required to allow the feature to operate, and the testing strategy, which will consist of the corresponding feature’s unit, integration, and canary testing if applicable.

2. Introduction & Traceability Matrix

Phase 1: The Minimum Viable Product (MVP)

Priority	Actor	ID	Module	Requirement
0	Reader	P0-01	AI Visualization Generation	I want to be able to see visualizations generate for the story that I am reading once I turn the page
0	Reader	P0-02	AI Visualization Generation	I want to be able to see visualizations of the story that I am reading
0	Reader	P0-03	AI Visualization Generation	I do not want the visualizations generated to distract from the reading experience
0	Reader	P0-04	AI Visualization Generation	I want the visualizations generated to be accurate to the story that I am reading
0	Reader	P0-05	AI Visualization Generation	I do not want the visualizations generated to indicate “spoilers” - content that I have not yet read or otherwise have any knowledge of
0	Reader	P0-06	AI Visualization Generation	I want the visualizations generated to be accurate to the text
0	Reader	P0-07	AI Visualization Generation	I want the visualizations generated to be appropriate to the genre of the story that I am reading
0	Reader	P0-08	User Interface	I want an easy to use interface page that quickly allows me to get started with minimal configuration
0	Reader	P0-09	Settings and Configuration	I want to be able to quickly customize my unique experience
0	Reader	P0-10	Personal Library	I want to be able to see a list of my personal library of books
0	Reader	P0-11	Personal Library	I want to be able to quickly search my library of books
0	Reader	P0-12	Personal Library	I want to be able to upload my existing collection of electronic books in plain text (.txt) format
0	Reader	P0-13	Personal Library	I want to be able to upload publicly available electronic books in plain text (.txt) format
1	Reader	P0-01	AI Visualization Generation	I want the visualizations generated on page turn to generate within 500 ms
1	Reader	P1-02	AI Visualization Generation	I want generated visualizations to remain consistent throughout the reading experience
1	Reader	P1-03	AI Visualization Generation	I want generated visualizations to remain the same even if I choose to re-read the book later in time
1	Reader	P1-04	AI Visualization Generation	I want the generated visualizations between different users reading the same book, with identical configuration settings chosen, to be identical to ensure consistency between users
1	Reader	P1-05	AI Visualization Generation	I want a visualization generated for each page that I am reading
1	Reader	P1-06	AI Visualization Generation	I want the visualizations generated to match the mood of the story that I am reading
1	Reader	P1-07	AI Visualization Generation	I want the visualizations generated to match the theme of the story that I am reading
1	Reader	P1-08	AI Visualization Generation	I want the ability to customize visualization parameters to fine tune the visualizations generated to match my unique tastes
1	Reader	P1-09	User Interface	I want an easy to use, sophisticated interface page to customize my unique experience
1	Reader	P1-10	Personal Library	I want to be able to visibly see my personal library of books
0	Admin	P0-13	Security & Data Protection	I want to be able to manage API keys, passwords, and any other private credential through AWS Secrets Manager
0	Admin	P0-14	Security & Data Protection	I want to use AWS IAM to enforce secure permission delegation
0	Admin	P0-15	Security & Data Protection	I want to be able to access up to 7 days worth of data in the form of data backups
0	Developer	P0-16	Observability & Governance	I want to be able to aggregate key business metrics instead of accumulating 1 data point per customer activity, in order to save on costs
0	Developer	P0-17	Observability & Governance	I want to be able to monitor key business metrics in a centralized dashboard
0	Developer	P0-18	Observability & Governance	I want to be able to create budget alerts to shut down any processes that breach the specified threshold
0	Developer	P0-19	Observability & Governance	I want to be alerted when key business metrics breach the specified SLO/SLA thresholds
0	Developer	P0-20	Automated Software Delivery	I want to be able to deploy changes seamlessly within a CI/CD pipeline
0	Developer	P0-21	Automated Software Delivery	I want to ensure new dependencies are thoroughly scanned for vulnerabilities before ever reaching production
0	Developer	P0-22	Automated Software Delivery	I want to be able to deploy changes gradually using blue/green and canary tests
1	Developer	P1-11	Image Optimization & Formatting	I want to be able to aggregate multiple pages worth of images into a single, collage-like image to save on image generation costs
1	Developer	P1-12	Image Optimization & Formatting	I want to be able to cut and crop each page’s image(s) out of the collage
1	Developer	P1-13	Image Optimization & Formatting	I want to be able to reformat the resolution, size, and other parameters of the image
0	Hardware	P0-23	Hardware Interface	I want to be able to signal to the application that the user has turned the page to the left (backward)
0	Hardware	P0-24	Hardware Interface	I want to be able to signal to the application that the user has turned the page to the right (forward)

Phase 2: Stretch Goals

Priority	Actor	ID	Module	Requirement
2	Reader	P2-01	Contextual Dictionary	I want to be able to find the definition of a word quickly by voice automation
2	Reader	P2-02	User Interface	I want to be able to flip the user interface from image display mode to text display mode to display the text that I am reading with a single tap on the screen
2	Reader	P2-03	User Interface	I want to be able to flip the user interface from text display mode back to image display mode with a single tap on the screen
2	Reader	P2-04	Contextual Dictionary	I want to be able to tap a particular word on the text displayed interface to be able to quickly find the definition of the word
2	Reader	P2-05	Contextual Dictionary	I want to be able to highlight a section of content in the text displayed mode to copy it
2	Reader	P2-06	Contextual Dictionary	I want the definition of a word that I choose to be displayed in a easy to read, non-distracting way
2	Reader	P2-07	Vocabulary Manager	I want there to be a word bank of recent words that I had defined displayed in a easy to read, non-distracting way
2	Reader	P2-08	Vocabulary Manager	I want to be able to tap the word in the word bank and have it show me the definition of the word
2	Reader	P2-09	Content Intelligence	I want to be able to generate detailed chapter summaries
2	Reader	P2-10	Content Intelligence	I want to be able to generate detailed page-by-page analysis
2	Reader	P2-11	Content Intelligence	I want to be able to generate detailed character analysis of the current characters in the story based on the current context of the story
2	Reader	P2-12	Content Intelligence	I want to be able to ask open-ended questions for the summaries/analysis’/highlighted text for a more granular response
2	Reader	P2-13	Content Intelligence	I want to be able to select specific passages in the text display mode and generate an analysis on it
2	Reader	P2-14	Annotations & Highlights	I want to be able to store specific passages that I highlight, in text display mode, in a passage bank to be referred to later
2	Reader	P2-15	Annotations & Highlights	I want to be able to analyze the passages stored in the bank in aggregate using artificial intelligence to facilitate a deeper synthesized analysis of the books content
2	Reader	P2-16	Language and Translations	I want to be able to translate foreign languages to english
2	Reader	P2-17	Hardware Interface	I want to be able to decide when to load the image to avoid potential spoilers on content that I have yet to read
2	Developer	P2-18	Personal Library	I want to ensure that the database containing the user’s library of books maintains real-time searching capabilities, even as the library of books begins to reach the hundreds, thousands, etc.
2	Hardware	P2-19	Hardware Interface	I want to be able to include a button that user’s can press to load the image for the page they are reading onto the screen


3. Feature Breakdown

Phase 1: The Minimum Viable Product (MVP)

Module: AI Visualization Generation (Ref: P0-01, P0-02, P0-03, P0-04, P0-05, P0-06, P0-07, P1-01, P1-02, P1-03, P1-04, P1-05, P1-06, P1-07, P1-08)

Services Used:

1. AWS Lambda: An event-driven Lambda for AI image generation
2. Amazon S3: An image repository for processed AI images generated by the Lambda
3. AWS Secrets Manager: Stores the Gemini Nano Banana/Grok Imagine Image Generation API key
4. Gemini Nano Banana: An API by Google that generates high quality AI images
5. Grok Imagine: An API by Tesla that generates high quality AI images
6. AWS CloudFormation: Facilitates the creation of an infrastructure-as-code template


Implementation Detail: This module will be implemented as an event-driven AWS Lambda function, It will be triggered immediately upon registering an invocation to the GenerateImages API. The Lambda will take the input data received from the API to retrieve the book metadata that images will be generated against. The Lambda will leverage the FormatImage API endpoints to optimize the images generated for quality assurance. The images will then be loaded into an Amazon S3 bucket for offline retrieval to provide real-time image loading.

Logic Flow:

1. GenerateImages API
    1. Input: The user taps on the “Download” button associated with the book that they would like to download images on through the Personal Library catalog user interface
    2. Action: The AI Visualization Generation Lambda is invoked with the book metadata passed to it as an input
2. Metadata Processing
    1. Input: The book metadata from the GeneratedImages API
    2. Action: The book’s metadata is processed for prompt context binding
        1. The book’s content is split by chapter and stored in an array
        2. The book’s other metadata is binded to the prompt template used for the AI image generation
3. Image Generation Processing
    1. Input: The prompt template that has been binded with the book metadata
    2. Action: The prompt template is passed to the Gemini Nano Banana or Grok Imagine Image Generation API
        1. The API key for the Gemini Nano Banana / Grok Imagine Image Generation API is stored in AWS Secrets Manager and is retrieved
        2. The Gemini Nano Banana / Grok Imagine Image Generation API is invoked with the context binded prompt template
    3. Condition: For loop
        1. Loop the image generation until all content of the array containing the book’s metadata has been processed
        2. IMPORTANT: Start with a single image generation to start to save on costs. Once the image is correct the majority of the time, increment the number of image generations until confidence of excessive generations is eliminated. Note that each chapter will generate only a couple of images. Each image generated will have 10 or 20 additional images, like a collage, for each 2 pages of the chapter. This is to save on costs. I.e, instead of generating 30 images per chapter (assuming 60 pages in one chapter), we can generate three images with 10 smaller images collaged in the image. FormatImagesAPI will be in charge of formatting and enhancing the individual images that the benchmark ends up passing as quality images that fit the narrative of the story.
    4. Validation: The images generated from the condition must be validated for quality assurance
        1. If the images meet the quality benchmark then continue to the post processing step
        2. If the images do not meet the quality benchmark then retry the condition
        3. If the images do not meet the quality benchmark after 4 retries (5 attempts) then log a message stating that the quality assurance tests have failed, record the metric, and continue to post processing
    5. Quality Benchmark Criteria
        1. Layer 1: Hard constraints
            1. Resolution ≥ 1024×1024 (Can adjust as needed)
            2. Aspect ratio matches target
            3. No empty/black images
            4. File size within bounds
            5. NSFW / safety classifier pass
        2. Layer 2: Automated visual scoring models
            1. Aesthetic score
            2. Sharpness / blur detection
            3. Contrast
            4. Artifact detection
        3. Layer 3: AI-as-a-judge
            1. This is where you can create a prompt template with specific benchmark criteria that the AI can use to judge image generation pass/fail scores.
                1. Given the image and the following criteria:
                    1. Matches chapter theme
                    2. No modern objects
                    3. Illustration style, not photorealistic
                    4. No text in image
                2. Score each criterion from 1–5.
                3. Return JSON only.
4. Post-Processing & Optimization
    1. Input: The array containing the images generated from the prompt template binded with the book’s metadata
    2. Action: The unoptimized images will be individually extracted from the collage, resized, properly formatted, and enhanced. The optimized images will then be stored in a collection and returned as an output.
        1. Collage Analysis & Segmentation
            1. Detect individual visual regions within the composite image
            2. Identify bounding boxes for each extracted AI visualization
            3. Validate segmentation boundaries to avoid:
                1. Grid lines
                2. Padding bleed
                3. Partial crops
        2. Image Extraction
            1. Extract each detected region as an independent image
            2. Preserve original pixel data without premature resampling
        3. Normalization & Resizing
            1. Resize extracted images to target resolution(s)
            2. Maintain aspect ratio
            3. Apply padding or cropping only if explicitly required by output format
        4. Formatting
            1. Convert image to target format (e.g., PNG, JPEG, WebP)
            2. Apply color profile normalization (sRGB)
            3. Enforce file size and dimension constraints
        5. Enhancement
            1. Apply controlled image enhancement (upscaling, sharpening, denoising)
            2. Enhancement must prioritize detail preservation over stylistic alteration
            3. Avoid hallucination or semantic drift
        6. Collection
            1. Store optimized images in an output collection
            2. Preserve ordering and metadata linkage to original source
    3. Condition: For loop
        1. Loop the image processing until all content of the array, containing the extracted AI visualization’s from the unoptimized collage of images, has been processed
    4. Validation: The images processed from the condition must be validated for quality assurance
        1. If the images meet the quality benchmark then continue to the post processing step
        2. If the images do not meet the quality benchmark then retry the condition
        3. If the images do not meet the quality benchmark after 4 retries (5 attempts) then log a message stating that the quality assurance tests have failed, record the metric, and continue to post processing
    5. Quality Benchmark Criteria
        1. Technical Validity
            1. Image decodes successfully
            2. Output format matches expected format
            3. File size within defined limits
            4. Dimensions meet minimum resolution requirements
            5. No corrupted or invalid pixel data
        2.  Segmentation & Cropping Integrity
            1. No visible grid lines or collage separators
            2. No unintended padding or background bleed
            3. Primary visual content is fully contained
            4. No significant subject truncation
        3.  Geometric Fidelity
            1. Aspect ratio preserved within tolerance
            2. No distortion introduced during resizing
            3. Extracted image area aligns with expected segmentation bounds
        4.  Detail Preservation & Enhancement Control
            1. Image sharpness meets minimum threshold
            2. Enhancement increases detail clarity without over-processing
            3. No excessive smoothing or artificial textures
            4. No visible compression artifacts or banding
        5. Semantic Consistency
            1. Enhanced image remains semantically consistent with the extracted source
            2. No hallucinated elements introduced
            3. No loss of primary visual meaning
        6. Standalone Image Illusion
            1. Image does not appear cropped from a collage
            2. Borders appear natural
            3. Composition is visually balanced
            4. No unnatural framing artifacts
5. Storage & Delivery
    1. Input: The optimized images for the user’s selected book
    2. Action: Store the images in an Amazon S3 bucket

Module: User Interface (Ref: P0-08, P1-09)

Module: Settings and Configuration (Ref: P0-09)

Module: Personal Library (Ref: P0-10, P0-11, P0-12, P0-13, P1-10)

Module: Security & Data Protection (Ref: P0-13, P0-14, P0-15)

TODO: Review this section thoroughly since it was AI generated
Services Used:

1. AWS Secrets Manager: Stores the Gemini Nano Banana Image Generation API key
2. AWS IAM: Manages permission delegation between services
3. AWS KMS: Encrypts the AWS Secrets Manager secrets at rest
4. AWS DynamoDB: TBD - Still need to determine what database(s) we will need [book library]
5. AWS Backup: Backs up S3 data containing optimized image generations for users’ books
6. AWS CloudFormation:  Facilitates the creation of an infrastructure-as-code template


Implementation Detail: This module will centralize all sensitive configuration and data resilience logic. A Zero-Trust approach will be implemented, meaning no service has permission to do anything unless explicitly granted via an IAM Policy.

* Credential Management (P0-13): We will move all "Hardcoded" credential related strings (API keys, Database passwords, etc) out of the codebase and into AWS Secrets Manager. Secrets will be encrypted at rest using AWS KMS (Key Management Service)
* Permission Delegation (P0-14): We will utilize IAM Roles for Service Accounts. Instead of using long-lived Access Keys, our Lambda functions and EC2 instances will "assume" temporary roles with the Principle of Least Privilege (PoLP)
* Data Resilience (P0-15): We will enable Point-In-Time Recovery (PITR) for DynamoDB and AWS Backup for S3. This ensures we can perform a "Snapshot Restore" to any second within the last 7 days

Logic Flow:

1. Secure Credential Retrieval (The "Handshake")
    1. Request: A backend component needs the API key for an external service
    2. Identity Check: The component presents its IAM Execution Role to Secrets Manager
    3. Validation: AWS verifies if the role has the secretsmanager:GetSecretValue permission for that specific secret
    4. Decryption: Secrets Manager uses a KMS Key to decrypt the value
    5. Injection: The secret is injected into the application's memory (never written to a log file or disk)
2. Automated Backup & Retention
    1. Configuration: Enable Continuous Backups on the primary DynamoDB tables
    2. Retention Policy: Set the RetentionPeriod to 7 days
    3. Cleanup: AWS Backup automatically deletes snapshots older than 168 hours (7 days) to optimize costs
    4. Recovery Logic: In the event of data corruption, the administrator uses the AWS CLI to trigger a RestoreTableToPointInTime command, creating a new table from the chosen timestamp

Module: Observability & Governance (Ref: P0-16, P0-17, P0-18, P0-19)

Module: Automated Software Delivery (Ref: P0-20, P0-21, P0-22)

Module: Hardware Interface (Ref: P0-23, P0-24)


Phase 2: Stretch Goals

Module: Contextual Dictionary

Module: Vocabulary Manager

Module: Content Intelligence

Module: Annotations & Highlights

Module: Language and Translations

Module: Hardware Interface


4. APIs

GenerateImages API

a download images button should exist on the UI under the personal library, so that users can pre-download the images that will be used throughout the book for real-time image loading.

POST: /images/generate

5. Data Models

Conceptual Data Models

* Business Rules / Domain Rules

Logical Data Models

Class Diagrams


TODO: Add more as the project evolves, start with a minimal viable product first

6. Databases

Services Used:

1. AWS DynamoDB: Fully managed, serverless database.
    1. We will use this for quick iteration. We can migrate to a relational database in the future if needed.

Primary Key: bookId
Database Schema:

{
"PK": "book_001",
"title": "The Future of Artificial Intelligence",
"authors": ["Divyesh Raman"],
"language": "en",
"publisher": "AI Press",
"publicationDate": "2026-01-23",
"isbn": "978-1234567890",
"genre": ["Technology", "Science"],
"pageCount": 320,
"fileUrl": "s3://mybucket/books/book_001.txt",
"chapters": [
{
"chapterNumber": 1,
"title": "Introduction",
"startOffset": 0,
"textLength": 8200,
"images": [
{
"id": "img_ch1_001",
"url": "https://cdn.example.com/images/img_ch1_001.png",
"provider": "grok",
"width": 1024,
"height": 1024,
"format": "png",
"createdAt": "2026-01-23T18:30:00Z",
"type": "CHAPTER"
}
]
},
{
"chapterNumber": 2,
"title": "A Brief History of AI",
"startOffset": 8200,
"textLength": 10400,
"images": []
}
]
}

* The plain text (.txt) book file will be stored in S3 and the URL will be saved to DynamoDB for that particular book entry. You can retrieve it freely this way through code.
* Each chapter will be parsed through code and stored in the table as well so that the necessary images can be pre-generated and stored in the table before the user begins to read the story.


7. Prompt Engineering & Templates

STYLE & MEDIUM
{ART_STYLE_DESCRIPTION}

BOOK CONTEXT
This illustration is for a book titled "{BOOK_TITLE}" by {BOOK_AUTHORS}.
Genre: {BOOK_GENRE}
Overall tone of the book: {BOOK_TONE}

CHAPTER CONTEXT
Chapter {CHAPTER_NUMBER}: "{CHAPTER_TITLE}"

TEXT RANGE TO VISUALIZE (Pages {PAGE_START}–{PAGE_END})
The following text represents approximately two consecutive pages of the book.
Create a single illustration that captures the key events, atmosphere, and emotional tone across this entire range, rather than a single moment.

TEXT SUMMARY
{TEXT_SUMMARY}

SCENE INSTRUCTION
Depict a symbolic or atmospheric scene that reflects what is happening during these pages.
Prioritize mood, setting, and emotional subtext over literal accuracy.
The image should give the reader an intuitive sense of what these pages are about.

VISUAL CONSTRAINTS
- No text, captions, or lettering in the image
- Avoid photorealism; this is an illustrated book
- No modern objects unless explicitly relevant to the story
- Maintain stylistic consistency with other illustrations in the book

OUTPUT GUIDANCE
High-quality illustration suitable for a printed literary book.

Watercolor Lillies Example

STYLE & MEDIUM
A delicate, hand-drawn illustration of watercolor lilies, rendered in fine pen-and-ink linework with soft watercolor washes. The scene feels nostalgic and quietly magical, evoking childhood memory and subtle unease—whimsical yet haunting. Muted, limited color palette with emphasis on shadow and negative space. Textured paper grain visible. Gentle surreal elements integrated naturally into the environment. Classic illustrated book aesthetic, intimate and atmospheric, poetic rather than literal, calm but emotionally charged.

BOOK CONTEXT
This illustration is for a book titled "The Ocean at the End of the Lane" by Neil Gaiman.
Genre: Fantasy, Literary Fiction
Overall tone of the book: Dreamlike, eerie, emotionally intimate, reflective.

CHAPTER CONTEXT
Chapter 4: "The Pond Behind the Farm"

TEXT RANGE TO VISUALIZE (Pages 3–4)
The following text represents approximately two consecutive pages of the book.
Create a single illustration that captures the combined narrative and emotional tone across both pages.

TEXT SUMMARY
The narrator recalls standing near a small pond behind the family farm. The water feels ancient and unknowable, and the surrounding lilies seem to watch quietly. The moment blends childhood calm with an underlying sense of unease, as if the place holds memories and secrets beyond the narrator’s understanding.

SCENE INSTRUCTION
Depict the pond and surrounding lilies as a place suspended between memory and reality.
The scene should feel still and contemplative, with a subtle sense of something hidden beneath the surface.
Avoid depicting characters directly; let the environment carry the emotion.

VISUAL CONSTRAINTS
- No text or lettering in the image
- No modern objects
- Avoid photorealism; painterly illustration only
- Maintain a cohesive style consistent with other chapter illustrations

OUTPUT GUIDANCE
High-quality illustration suitable for a printed literary book, with a calm but haunting emotional presence.


STYLE & MEDIUM
A dark, gestural, hand-rendered illustration inspired by the cover art of The Ocean at the End of the Lane. Rendered with expressive, scratchy linework and painterly strokes that feel etched, wind-carved, or scraped out of darkness. The image favors movement, silhouette, and negative space over detail. Forms emerge from and dissolve back into shadow.
The palette is extremely limited and nocturnal—deep blacks and midnight blues punctuated by pale, luminous whites and cold cyan highlights. Brushstrokes feel energetic and organic, as if drawn with dry brush, ink, or chalk against black paper. Texture is bold and tactile, with visible grain, streaking, and rough edges rather than delicate washes.
The mood is mythic and dreamlike rather than illustrative—haunting, timeless, and emotionally charged. The image should feel like a memory or a story scratched into darkness, calm on the surface but vast and unknowable beneath.

BOOK CONTEXT
This illustration is for a book titled "The Ocean at the End of the Lane" by Neil Gaiman.
Genre: Fantasy, Literary Fiction
Overall tone of the book: Dreamlike, eerie, emotionally intimate, reflective, and mythic.

CHAPTER CONTEXT
Chapter 4: "The Pond Behind the Farm"

TEXT RANGE TO VISUALIZE (Pages 3–4)
The following text represents approximately two consecutive pages of the book.
Create a single illustration that captures the emotional resonance and symbolic weight of the moment rather than a literal scene.

TEXT SUMMARY
The narrator recalls standing near a small pond behind the family farm. The water feels ancient and unknowable—far larger and older than it appears. The lilies and surrounding darkness seem aware, quietly observing. Childhood calm is present, but beneath it lies a vast, unsettling depth, as though the place holds memories and truths beyond human scale.

SCENE INSTRUCTION
Depict the pond and lilies as shapes emerging from darkness, defined more by motion, light, and absence than by clear outlines.
The water should feel endless despite its small size—suggest depth through swirling strokes, shadow, and negative space rather than literal perspective.
Lilies may appear as pale, glowing forms hovering on the surface, while darker currents or shapes churn beneath.
Avoid literal realism; let the environment feel symbolic, ancient, and alive.

VISUAL CONSTRAINTS
- No text or lettering in the image
- No modern objects
- No photorealism
- Avoid soft pastel watercolor aesthetics
- Favor high contrast, silhouette, and gestural mark-making
- Maintain stylistic cohesion with a dark, cover-art-like visual language

OUTPUT GUIDANCE
High-quality illustration suitable for a printed literary book.
The image should feel quietly overwhelming—beautiful but unsettling, minimal yet emotionally vast, as though the pond is not merely a place but a threshold.


STYLE & MEDIUM
A dark, gestural, hand-rendered illustration inspired by the cover art of The Ocean at the End of the Lane. Rendered with expressive, scratchy linework and painterly strokes that feel etched, wind-carved, or scraped out of darkness. The image favors movement, silhouette, and negative space over detail. Forms emerge from and dissolve back into shadow.
The palette is extremely limited and nocturnal—deep blacks and midnight blues punctuated by pale, luminous whites and cold cyan highlights. Brushstrokes feel energetic and organic, as if drawn with dry brush, ink, or chalk against black paper. Texture is bold and tactile, with visible grain, streaking, and rough edges rather than delicate washes.
The mood is mythic and dreamlike rather than illustrative—haunting, timeless, and emotionally charged. The image should feel like a memory or a story scratched into darkness, calm on the surface but vast and unknowable beneath.

BOOK CONTEXT
This illustration is for a book titled "The Ocean at the End of the Lane" by Neil Gaiman.
Genre: Fantasy, Literary Fiction
Overall tone of the book: Dreamlike, eerie, emotionally intimate, reflective, and mythic.

CHAPTER CONTEXT
Early chapter: The first appearance of Ursula Monkton

TEXT RANGE TO VISUALIZE (Pages 3–4)
The illustration should synthesize the emotional impact of Ursula Monkton’s introduction rather than depict a single literal action.
Focus on the sense of intrusion and imbalance she brings into the narrator’s world.

TEXT SUMMARY
A mysterious woman appears at the family home, presenting herself as calm, attractive, and reassuring. Yet her presence feels profoundly wrong—too knowing, too close, and subtly threatening. She does not belong to the child’s world, and her arrival marks the beginning of something predatory and inescapable. Her danger is quiet, patient, and hidden beneath a composed surface.

SCENE INSTRUCTION
Depict Ursula Monkton as a partially formed presence, not a clear portrait.
She may appear as a tall, looming silhouette or fragmented figure emerging from darkness—suggested through curves, angles, and negative space rather than explicit features.
Hints of a human form—an outline of hair, a shoulder, a smile implied through light rather than drawn—should feel almost recognizable but never fully resolved.
The surrounding space should feel distorted or warped by her presence, as though reality bends slightly toward her.
The composition should place the viewer at a child’s eye level, reinforcing vulnerability and unease.

VISUAL CONSTRAINTS
- No text or lettering in the image
- No photorealism
- Avoid clear facial detail or realistic anatomy
- No modern objects
- Favor silhouette, implication, and abstraction
- Maintain high contrast and visual tension

OUTPUT GUIDANCE
High-quality illustration suitable for a printed literary book.
The image should feel quietly predatory and invasive—calm on the surface, but charged with threat beneath. Ursula Monkton should feel less like a person and more like a presence that has stepped into the wrong world and refuses to leave.

<TBD>

STYLE & MEDIUM
A nightmarish, psychologically oppressive mixed-media illustration in the vein of experimental graphic novel art. Combines distressed ink linework, smeared acrylic paint, watercolor stains, scratched charcoal, and degraded photographic textures. Imagery appears eroded, fragmented, and unstable, as if decaying from within. Heavy use of abrasion, stains, drips, and tactile surface damage. Claustrophobic composition with collapsing spatial logic. Extreme contrast and shadow dominate, swallowing detail. Color palette is sickly and muted—deep blacks, dirty grays, bruised blues, rusted reds, and jaundiced yellows—applied unevenly and violently. Harsh, directional lighting cuts through darkness rather than illuminating it. The overall effect is raw, invasive, and psychologically hostile rather than beautiful or decorative.

BOOK CONTEXT
This illustration is for a book titled "Arkham Asylum: A Serious House on Serious Earth" by Grant Morrison, illustrated by Dave McKean.
Genre: Psychological Horror, Graphic Novel
Overall tone of the book: Oppressive, symbolic, disorienting, introspective, and mentally unstable. Reality feels fractured, subjective, and unreliable.

CHAPTER CONTEXT
Interior sequence: a moment of psychological descent within the asylum.
The setting reflects the inner collapse of the mind—architecture, memory, and identity bleeding together.

TEXT RANGE TO VISUALIZE (Pages 3–4)
The image should synthesize multiple beats rather than depict a literal moment.
Create a single illustration that captures the emotional and psychological atmosphere of the section rather than narrative specifics.

TEXT SUMMARY
The asylum is not merely a place but a living psychological force. Walls seem to breathe with memory and trauma. Organic forms—flowers, faces, limbs—appear corrupted, watching, or trapped within the structure. Time, identity, and sanity feel unstable, as if the environment itself is exerting pressure on the mind.

SCENE INSTRUCTION
Depict a symbolic environment where lilies or organic forms are present but corrupted—wilting, distorted, or fused with architectural elements.
The space should feel enclosed and collapsing, with no clear foreground or background.
Avoid clear perspective or spatial comfort.
Let textures, shadows, and fragmentation carry the emotion rather than identifiable figures.
Any human presence should be implied only through partial forms, faces, or gestures emerging from darkness or walls.

VISUAL CONSTRAINTS
- No text or lettering in the image
- No clean or polished surfaces
- Avoid symmetry and visual balance
- No photorealism; mixed-media illustration only
- Maintain visual discomfort and ambiguity
- Imagery should feel damaged, layered, and psychologically unstable

OUTPUT GUIDANCE
High-resolution illustration suitable for a printed graphic novel or art book.
The image should feel emotionally invasive, unsettling, and symbolic—prioritizing psychological tension, texture, and atmosphere over clarity or narrative literalism.



8. Testing Strategy

8.1 Unit Testing

8.2 Integration Testing

8.3 Canary Testing

8.4 Security Testing

8.4 White-Box Testing

8.5 Black-Box Testing


Quip Link: https://quip.com/WcmJAnWRbNNr/Technical-Specification-Document-TSD
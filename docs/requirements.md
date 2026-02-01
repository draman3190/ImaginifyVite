Requirements Document

Non-Functional Requirements

Performance and Scalability

1. Latency
    1. Real-Time for user-interface, performance, and data retrieval characteristics
    2. Near-Real-Time for processing related characteristics (metrics, offline processing, etc.)
2. Peak Load
    1. The system must support a sustained load of 10 users at any given moment
    2. The LLM related APIs must limit concurrent API invocations to up to 5 per minute per user to maintain costs
    3. Utility and performance related APIs must limit concurrent API invocations to appropriate limits to ensure costs stay as minimal as possible without the loss of performance and degraded user experience
3. Scalability
    1. The system must be configured to utilize the bare minimum resources to sustain 10 users at all times
    2. The system does not currently require the need for auto-scaling
4. Resource Utilization
    1. CPU utilization across each compute instance must not exceed 5% under standard operating load
    2. Database, compute, and any other related metric should be carefully selected to handle the bare minimum traffic of up to 10 users, without any loss of performance
    3. Application file size should be optimized to be as minimal as possible, while still delivering the necessary features specified in the system design

Maintainability and Supportability

1. Code Quality
    1. The codebase must maintain an automated test coverage of 100% of critical business logic (unit tests, integration tests, interface tests, white-box testing, black-box testing, etc.)
    2. The codebase must maintain the highest standards and utilize the appropriate design patterns where applicable to facilitate long-term maintainability and extensibility
    3. The codebase must utilize dependency injection for enhanced testability and maintainability
2. Monitoring
    1. System health, error rates, and key business metrics must be collected and visualized in a central dashboard within a 5-minute reporting lag
    2. Alerts should be triggered upon SLO/SLA breach in order to ensure a quick and clean resolution
    3. Budget limits should be created that will automate the shut down of services that breach the monthly allowance to prevent overspending
3. Deployment
    1. New application versions must be deployable to production using an automated CI/CD pipeline
    2. The CI/CD pipeline must contain blue/green and canary testing before deployments to subsequent stages to ensure zero downtime

Reliability and Availability

1. Availability
    1. The system must maintain 99.9% uptime
2. Data Backup
    1. Full data backups must be performed daily and be retained for 7 days
    2. Data backups must only be replicated in a single availability zone. This can be increased in the future should the project expand scope

Dependency Scanning

1. Build Failure Policy
    1. The pipeline shall automatically fail and block deployment if Amazon Inspector identifies any "Critical" or "High" severity vulnerabilities with an available patch
2. Vulnerability Freshness
    1. The scanning engine (Inspector) must utilize a vulnerability database updated within the last 24 hours to ensure protection against Zero-Day exploits
3. Scanning Coverage
    1. 100% of third-party libraries and container base images must be analyzed; the build must fail if the SBOM (Software Bill of Materials) cannot be generated.

Security

1. Identity Provider
    1. All user and service authentication and authorization must be delegated to and managed exclusively by AWS IAM/AWS Cognito
2. Principle of Least Privilege (PoLP)
    1. IAM Policies attached to users, groups, and roles must follow the principle of least privilege. Permissions must be scoped to specific resources (ARNs), not wildcards (*)
3. Authorization Enforcement
    1. Service-to-service communication must be secured by IAM Roles for Service Accounts, requiring valid AWS credentials for access
4. Key Management
    1. All application secrets (API keys, database credentials) must be managed and rotated via AWS Secrets Manager, accessible only via strict IAM role assumptions
5. Multi-Factor Auth (MFA)
    1. Multi-Factor Authentication (MFA) must be enforced for all administrative IAM users and all standard users
6. Session Lifespan
    1. Temporary credentials generated via IAM Role assumption must have a maximum session duration of no more than 1 hour
7. Resources
    1. All resources, unless otherwise specified, should remain private with the necessary security safeguards in place to prevent unauthorized user access
8. Audits
    1. Minimal at this time to prevent overspending, however, should the project expand in scope in the future, auditing will be enhanced

Usability

1. Compatibility
    1. The application should begin by initially ensuring compatibility with typical tablet platforms and the subsequent proprietary hardware that will be developed to pair with the application. Future platform support extensions will be facilitated ad-hoc (i.e, mobile, desktop, etc.)
2. User Interface Consistency
    1. All user-interface and components must adhere to the defined system design


Functional Requirements

Modules

AI Visualization Generation

Context: This module will be responsible for generating AI images for the content that the user is viewing. It will handle various edge cases to ensure that the user is given up-to-date images, without hindering the reading experience.

* P0
    * Reader
        * I want to be able to see visualizations generate for the story that I am reading once I turn the page
        * I want to be able to see visualizations of the story that I am reading
        * I do not want the visualizations generated to distract from the reading experience
        * I want the visualizations generated to be accurate to the story that I am reading
        * I do not want the visualizations generated to indicate “spoilers” - content that I have not yet read or otherwise have any knowledge of
        * I want the visualizations generated to be accurate to the text
        * I want the visualizations generated to be appropriate to the genre of the story that I am reading
* P1
    * Reader
        * I want generated visualizations to remain consistent throughout the reading experience
        * I want generated visualizations to remain the same even if I choose to re-read the book later in time
        * I want the generated visualizations between different users reading the same book, with identical configuration settings chosen, to be identical to ensure consistency between users
        * I want a visualization generated for each page that I am reading
        * I want the visualizations generated to match the mood of the story that I am reading
        * I want the visualizations generated to match the theme of the story that I am reading
        * I want the ability to customize visualization parameters to fine tune the visualizations generated to match my unique tastes
    * Developer
        * I want the visualizations generated on page turn to generate within 500 ms

Additional Details
TODO: Add a fully fleshed out use case model here with all the different success/failure scenarios here. Do this for each module. It will be useful for the creating of the Domain Model (Conceptual Data Model) later.

User Interface

Context: This module will be responsible for features related to the user interface display that users will interact with to navigate the application. It primarily comprises of the building blocks for displaying the user interface content.

* P0
    * Reader
        * I want an easy to use interface page that quickly allows me to get started with minimal configuration
* P1
    * Reader
        * I want an easy to use, sophisticated interface page to customize my unique experience
* P2
    * Reader
        * I want to be able to flip the user interface from image display mode to text display mode to display the text that I am reading with a single tap on the screen
        * I want to be able to flip the user interface from text display mode back to image display mode with a single tap on the screen

Settings and Configuration

Context: This module will be responsible for updating user related settings to enhance the user experience.

* P0
    * Reader
        * I want to be able to quickly customize my unique experience

Personal Library

Context: This module will be responsible for the business logic related to querying and searching the user’s library database. The visualization of the library will be handled in the User Interface module.

* P0
    * Reader
        * I want to be able to see a list of my personal library of books
        * I want to be able to quickly search my library of books
        * I want to be able to upload my existing collection of electronic books in plain text (.txt) format
        * I want to be able to upload publicly available electronic books in plain text (.txt) format
* P1
    * Reader
        * I want to be able to visibly see my personal library of books
* P2
    * Developer
        * I want to ensure that the database containing the user’s library of books maintains real-time searching capabilities, even as the library of books begins to reach the hundreds, thousands, etc.

Security & Data Protection

Context: This module will be responsible for securing the application with AWS related security services, such as IAM, AWS Secrets Manager, AWS Backup, etc.

* P0
    * Admin
        * I want to be able to manage API keys, passwords, and any other private credential through AWS Secrets Manager
        * I want to use AWS IAM to enforce secure permission delegation
        * I want to be able to access up to 7 days worth of data in the form of data backups

Observability & Governance

Context: This module will be responsible for adding observability within the application. It will measure key business metrics for analysis, display the metrics in a centralized dashboard for visibility, and create monitors that will alert the user when specified limits have been reached.

* P0
    * Developer
        * I want to be able to aggregate key business metrics instead of accumulating 1 data point per customer activity, in order to save on costs
        * I want to be able to monitor key business metrics in a centralized dashboard
        * I want to be alerted when key business metrics breach the specified SLO/SLA thresholds
        * I want to be able to create budget alerts to shut down any processes that breach the specified threshold

Automated Software Delivery

Context: This module will be responsible for the Continuous Integration and Continuous Deployment (CI/CD) pipeline that will automate the building, testing, and deployments of the changes made to the application.

* P0
    * Developer
        * I want to be able to deploy changes seamlessly within a CI/CD pipeline
        * I want to ensure new dependencies are thoroughly scanned for vulnerabilities before ever reaching production
        * I want to be able to deploy changes gradually using blue/green and canary tests

Image Optimization & Formatting

Context: This module will be responsible for the supporting tools used to optimize and format the images generated by the AI in the AI Visualization Generation module. The image optimization will significantly reduce the costs by maximizing the number of high quality images outputted per LLM API invocation.

* P1
    * Developer
        * I want to be able to aggregate multiple pages worth of images into a single, collage-like image to save on image generation costs
        * I want to be able to cut and crop each page’s image(s) out of the collage
        * I want to be able to reformat the resolution, size, and other parameters of the image

Hardware Interface

Context: This module will be responsible for the business logic related to the user input on the physical hardware,

* P0
    * Hardware
        * I want to be able to signal to the application that the user has turned the page to the left (backward)
        * I want to be able to signal to the application that the user has turned the page to the right (forward)
* P2
    * Reader
        * I want to be able to decide when to load the image to avoid potential spoilers on content that I have yet to read
    * Hardware
        * I want to be able to include a button that user’s can press to load the image for the page they are reading onto the screen

Contextual Dictionary

Context: This module will be responsible for searching and displaying information related to words, phrases, or passages that a user interacts with. It will act as a quick-lookup so that the user does not need to context switch to another device or application to gather the information.

* P2
    * Reader
        * I want to be able to find the definition of a word quickly by voice automation
        * I want to be able to tap a particular word on the text displayed interface to be able to quickly find the definition of the word
        * I want to be able to highlight a section of content in the text displayed mode to copy it
        * I want the definition of a word that I choose to be displayed in a easy to read, non-distracting way

Vocabulary Manager

Context: This module will be responsible for storing words that the user has engaged with. It will act as a bank for information related to the words stored to be quickly retrieved should the user require it.

* P2
    * Reader
        * I want there to be a word bank of recent words that I had defined displayed in a easy to read, non-distracting way
        * I want to be able to tap the word in the word bank and have it show me the definition of the word

Content Intelligence

Context: This module will be responsible for analyzing the content that the user is reading. It will provide detailed analysis of the content, and also allow open-ended questions for a more curated user experience.

* P2
    * Reader
        * I want to be able to generate detailed chapter summaries
        * I want to be able to generate detailed page-by-page analysis
        * I want to be able to generate detailed character analysis of the current characters in the story based on the current context of the story
        * I want to be able to ask open-ended questions for the summaries/analysis’/highlighted text for a more granular response
        * I want to be able to select specific passages in the text display mode and generate an analysis on it

Annotations & Highlights

Context: This module will be responsible for storing passages that the user has engaged with. It will act as a bank for information related to the passages stored to be quickly retrieved should the user require it. This module will utilize the Content Intelligence module’s business logic in order to facilitate analysis’.

* P2
    * Reader
        * I want to be able to store specific passages that I highlight, in text display mode, in a passage bank to be referred to later
        * I want to be able to analyze the passages stored in the bank in aggregate using artificial intelligence to facilitate a deeper synthesized analysis of the books content

Language & Translations

Context: This module will be responsible for translating text between different languages.

* P2
    * Reader
        * I want to be able to translate foreign languages to english

Quip Link: https://quip.com/8rbNAvPsLPuS#RGKAAAgiD1Z
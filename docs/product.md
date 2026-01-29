Imaginify (Non-Commercial / Private Usage Only)

1. Purpose

The purpose of this document is to provide a technical specification and design for the Imaginify application. It will provide details on the system architecture, core functionalities, functional and non-functional requirements, data models, and test suites.

2. Background

There are currently five primary services available for public use that currently enhance the reading experience. These five services are Nook by Barnes and Noble, Kindle by Amazon, Rakuten Kobo or simply Kobo, Google Play Books by Google, and Apple Play Books by Apple. There are additional services that provide similar experiences, however the aforementioned services comprise the major segmentation of the market, with near-identical features to the services not listed.

2.1. - Existing Process

There currently does not exist a service that provides an enhanced reading experience through the use of artificial intelligence (AI) in creative ways, such as image generation, video generation, or any other additional media form, in which existing content is analyzed and a media form utilizing the image generated from the text is created.

3. Introduction

The Imaginify application will provide an enhanced reading experience through the use of AI. It will utilize image generation features to create visualizations to pair with the text that the user is currently reading. The visualizations will come in various media formats that will alter the portrayal of the selected text accordingly. For example, if the comic format was selected, the visualizations that would be generated from the text would be formatted in a typical comic format, with individual panels with scenes and acts being portrayed as opposed to a typical singular image. It will contain less features compared to the current standards offered through Nook and Kindle, in regard to highlighting text, quick dictionary searches, etc, as the primary purpose is for image generation, however enhancements will be made where applicable.

4. Terminology

AI: Artificial intelligence is the creation of computer systems that can perform tasks typically requiring human intelligence.
Nook: An electronic reader created by Barnes and Noble.
Kindle: An electronic reader created by Amazon.
Kobo: An electronic reader created by Rakuten Kobo.
Google Play Books: An electronic reader created by Google.
Apple Play Books: An electronic reader created by Apple.

5. Stakeholders

Who are we?
I am an independent solo developer, who is creating this application solely to enhance my own reading experience, due to my limited ability to generate visualizations from my own thoughts.

Who are our customers?
Myself and my immediate circle of friends and family will be the sole users of this application, in order to adhere to copyright laws that pertain to modifying an existing creator’s work. This product will be used solely for private usage, therefore, adhering to existing copyright laws to maintain lawful integrity.

6. Requirements

Requirements Document

7. High Level Design Diagrams

7.1 User Interface Design

TODO: The different high level overviews of how the UI will appear on the hardware/app

7.2 System Design

TODO: High level overview of the system/app and all its components/modules

* In each design, ensure you have an alternatives section to highlight the potential choices and which one you went with and which ones you didn’t and why
* Technology Stack
    * The front-end technological stack will utilize the latest editions of the React framework
    * The back-end technological stack will utilize the latest editions of the Java and Python programming languages with the help of the Spring framework
    * The infrastructure-as-code (IaC) will utilize the latest edition of the Typescript programming language
    * The application will utilize the Amazon Web Services (AWS) cloud ecosystem as its backbone for all IT related infrastructure and application building blocks

7.3 Module Design

Module: AI Visualization Generation

![AI Visualization Generation Design Diagram](/docs/images/diagrams/modules/ai-visualization-generation/AI Visualization Generation Design Diagram.png)

7.4 Deployment Design

TODO: The CI/CD high level overview

8. Technical Specifications

Technical Specification Document (TSD)

9. Hardware Specifications

TODO: Hardware specifications document (HSD)

Quip Link: https://quip.com/z2dWASZRuIrk#edYAAAkpskG
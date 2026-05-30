const fs = require('fs');
const path = require('path');

async function main() {
  try {
    const { Anthropic } = await import('@anthropic-ai/sdk');
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const imagePath = path.join(__dirname, 'refrence.png');
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: base64Image,
              },
            },
            {
              type: 'text',
              text: 'Describe the overall layout of this UI, specifically how the Sidebar, ThreadList (list of emails), ThreadReader (email content), and Header are arranged. Which components span the full height? Which are stacked? Be extremely precise about the arrangement, like "The sidebar is on the far left spanning full height. The header spans the top of the ThreadList and ThreadReader. The ThreadList and ThreadReader are side by side below the header."',
            },
          ],
        },
      ],
    });

    console.log(response.content[0].text);
  } catch (error) {
    console.error(error);
  }
}
main();

import type { DataItem, Route, Data } from '@/types';
import cache from '@/utils/cache';
import got from '@/utils/got';
import { load } from 'cheerio';
import timezone from '@/utils/timezone';
import { parseDate } from '@/utils/parse-date';

export const route: Route = {
    path: '/news/:category{.+}?',
    name: 'Unknown',
    example: '/xmnn/news/xmxwfb',
    maintainers: [],
    handler,
};

async function handler(ctx) {
    const { category = 'xmxw' } = ctx.req.param();
    const limit = ctx.req.query('limit') ? Number.parseInt(ctx.req.query('limit'), 10) : 30;

    const rootUrl = 'https://news.xmnn.cn';
    const currentUrl = new URL(`${category}/`, rootUrl).href;

    const { data: response } = await got(currentUrl);

    const $ = load(response);

    let items = $('div#sort_body ul li a')
        .slice(0, limit)
        .toArray()
        .map((item) => {
            const element = $(item);

            return {
                title: element.find('h1').text().trim(),
                link: element.prop('href'),
                description: element.find('div.abstract').html(),
                author: element.find('div.source').text(),
                pubDate: timezone(parseDate(element.find('div.time').text()), +8),
            } as DataItem;
        });

    items = await Promise.all(
        items.map((item) =>
            cache.tryGet(item.link!, async () => {
                const { data: detailResponse } = await got(item.link);

                const content = load(detailResponse);

                item.title = content('div.cont-h, div.tip h1').text().trim();
                item.description = content('div.TRS_Editor').html() || '';
                item.author = content('span.cont-a-src a')
                    .toArray()
                    .map((a) => ({ name: content(a).text() }));
                item.pubDate = timezone(parseDate(content('span.time, div.pubtime div.w').contents().first().text().trim()), +8);

                return item;
            })
        )
    );

    const title = $('title').text();
    const icon = new URL($('link[rel="icon"]').prop('href')!, rootUrl).href;

    return {
        item: items,
        title,
        link: currentUrl,
        description: $('meta[name="description"]').prop('content'),
        language: 'zh-CN',
        icon,
        logo: icon,
        subtitle: $('div.h').text(),
        author: title.split(/_/).pop(),
    } as Data;
}

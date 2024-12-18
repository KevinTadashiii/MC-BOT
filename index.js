const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals: { GoalNear } } = require('mineflayer-pathfinder');
const { Vec3 } = require('vec3');
const minecraftData = require('minecraft-data');

function createBot() {
    const bot = mineflayer.createBot({
        host: '20.ip.gl.ply.gg',
        port: 26646,
        username: 'Tukang_Kebun',
        version: '1.21.4'
    });

    const mcData = minecraftData(bot.version);
    bot.loadPlugin(pathfinder);

    bot.once('spawn', () => {
        console.log('Bot joined the server!');
        bot.chat("Hello, I do farming!");

        const defaultMove = new Movements(bot, mcData);
        bot.pathfinder.setMovements(defaultMove);
    });

    bot.on('chat', async (username, message) => {
        if (username === bot.username) return;
        console.log(`${username} : ${message}`);

        switch (message) {
            case "!come":
                await comeToPlayer(username);
                break;
            case "!farm":
                await startFarming();
                break;
            case "!desah":
                bot.chat("mpsss ahh crott crot");
                break;
            case "!store":
                await storeCarrots();
                break;
            case "!inventory":
                printInventory();
                break;
            default:
                break;
        }
    });

    function printInventory() {
        const inventoryItems = bot.inventory.items();
        if (inventoryItems.length === 0) {
            bot.chat("My inventory is empty.");
            return;
        }

        const groupedItems = inventoryItems.reduce((acc, item) => {
            if (acc[item.name]) {
                acc[item.name] += item.count;
            } else {
                acc[item.name] = item.count;
            }
            return acc;
        }, {});

        const inventoryList = Object.entries(groupedItems)
            .map(([name, count]) => `${name} x${count}`)
            .join(', ');

        bot.chat(`Inventory: ${inventoryList}`);
    }

    async function comeToPlayer(username) {
        bot.chat("Okay, I'm coming!");
        const player = bot.players[username];
        if (player?.entity) {
            const { x, y, z } = player.entity.position;
            const goal = new GoalNear(x, y, z, 1);
            bot.pathfinder.setGoal(goal);
        } else {
            bot.chat("I don't see you!");
        }
    }

    async function startFarming() {
        bot.chat("Starting to farm!");
        await harvestCarrots();
    }

    async function harvestCarrots() {
        const carrotBlockId = mcData.blocksByName.carrots.id;

        while (true) {
            const carrots = bot.findBlocks({
                matching: block => block.type === carrotBlockId && block.metadata === 7,
                maxDistance: 7,
                count: 50
            });

            if (carrots.length === 0) {
                bot.chat("No fully grown carrots found. Stopping farming...");
                await storeCarrots();
                break;
            }

            for (const carrotPos of carrots) {
                const block = bot.blockAt(carrotPos);
                if (block.metadata !== 7) continue;

                await bot.pathfinder.goto(new GoalNear(carrotPos.x, carrotPos.y, carrotPos.z, 1));
                await bot.dig(block);

                const carrotItem = bot.inventory.findInventoryItem(mcData.itemsByName.carrot.id);
                if (carrotItem) {
                    await bot.equip(carrotItem, 'hand');
                    const blockBelow = bot.blockAt(carrotPos.offset(0, -1, 0));
                    if (blockBelow?.name === 'farmland') {
                        try {
                            await bot.placeBlock(blockBelow, new Vec3(0, 1, 0), { timeout: 10000 });
                        } catch (err) {
                            if (err.message.includes('Event') && err.message.includes('did not fire within timeout')) {
                                console.log('Timeout error occurred while placing block. Continuing...');
                            } else {
                                console.error('Error placing block:', err);
                            }
                        }
                    } else {
                        console.log("Cannot plant on this block. Need farmland!");
                    }
                } else {
                    console.log("Bot don't have any carrots to plant!");
                }
            }

            await sleep(1000);
        }
    }

    async function storeCarrots() {
        bot.chat("Storing carrots into nearby chest...");
        const chestBlockId = mcData.blocksByName.chest.id;
    
        const chestPositions = bot.findBlocks({
            matching: chestBlockId,
            maxDistance: 9,
            count: 1
        });
    
        if (!chestPositions.length) {
            bot.chat("No nearby chest found to store carrots.");
            return;
        }
    
        const chestPos = chestPositions[0];
        const chestBlock = bot.blockAt(chestPos);
    
        await bot.pathfinder.goto(new GoalNear(chestPos.x, chestPos.y, chestPos.z, 1));
    
        const chest = await bot.openChest(chestBlock);
        const carrotItems = bot.inventory.items().filter(item => item.name === 'carrot');
    
        if (!carrotItems.length) {
            bot.chat("No carrots found in my inventory to store.");
            await chest.close();
            return;
        }
    
        const totalCarrots = carrotItems.reduce((sum, item) => sum + item.count, 0);
        const carrotsToStore = totalCarrots - 5;
    
        if (carrotsToStore <= 0) {
            bot.chat("I need to keep at least 5 carrots in my inventory.");
            await chest.close();
            return;
        }
    
        let totalCarrotsStored = 0;
        for (const carrotItem of carrotItems) {
            const carrotsToDeposit = Math.min(carrotItem.count, carrotsToStore - totalCarrotsStored);
            await chest.deposit(carrotItem.type, null, carrotsToDeposit);
            totalCarrotsStored += carrotsToDeposit;
    
            if (totalCarrotsStored >= carrotsToStore) break;
        }
    
        bot.chat(`Stored ${totalCarrotsStored} carrots into the chest.`);
        await chest.close();
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    bot.on('end', () => {
        console.log('Bot disconnected from the server.');
        setTimeout(createBot, 5000);
    });
}

createBot();

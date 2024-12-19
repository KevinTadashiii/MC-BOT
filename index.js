const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals: { GoalNear } } = require('mineflayer-pathfinder');
const { Vec3 } = require('vec3');
const minecraftData = require('minecraft-data');
const cmd = require('mineflayer-cmd').plugin;

function createBot() {
    const bot = mineflayer.createBot({
        host: '20.ip.gl.ply.gg',
        port: 26646,
        username: 'Tukang_Kebun',
        version: '1.21.4'
    });

    const mcData = minecraftData(bot.version);
    bot.loadPlugin(pathfinder);
    bot.loadPlugin(cmd);

    bot.once('spawn', () => {
        console.log('Bot joined the server!');
        bot.chat("Hello, I do farming!");

        const defaultMove = new Movements(bot, mcData);
        bot.pathfinder.setMovements(defaultMove);

        registerCommands();
    });

    bot.on('chat', async (username, message) => {
        if (username === bot.username) return;
        if (message.startsWith('!')) {
            const command = message.substring(1);
            bot.cmd.run(username, command);
        }
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

    function registerCommands() {
        bot.cmd.registerCommand('composter', async (sender, flags, args) => {
            const amount = parseInt(args[0]);
            if (isNaN(amount) || amount <= 0) {
                bot.chat("Please specify a valid number of carrots.");
                return;
            }
            await manageCarrotsAndCompost(amount);
        }, 'Manage carrots and compost', 'composter <amount>');
    }

    function printInventory() {
        const inventoryItems = bot.inventory.items();
        if (inventoryItems.length === 0) {
            bot.chat("My inventory is empty.");
            return;
        }

        const groupedItems = inventoryItems.reduce((acc, item) => {
            acc[item.name] = (acc[item.name] || 0) + item.count;
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
        const boneMealItemId = mcData.itemsByName.bone_meal.id;

        while (true) {
            const carrots = findCarrotBlocks();
            let boneMealAvailable = bot.inventory.findInventoryItem(boneMealItemId) !== null;
            let fullyGrownCarrotFound = false;

            for (const carrotPos of carrots) {
                const block = bot.blockAt(carrotPos);

                if (block.metadata === 7) {
                    fullyGrownCarrotFound = true;
                    await harvestCarrot(carrotPos);
                } else if (boneMealAvailable) {
                    await growCarrotWithBoneMeal(carrotPos, boneMealItemId);
                }
            }

            if (!boneMealAvailable && !fullyGrownCarrotFound) {
                bot.chat("No bone meal and no fully grown carrots left. Stopping farming...");
                await collectDroppedCarrots();
                await storeCarrots();
                break;
            }

            await sleep(1000);
        }
    }

    function findCarrotBlocks() {
        const carrotBlockId = mcData.blocksByName.carrots.id;
        return bot.findBlocks({
            matching: block => block.type === carrotBlockId,
            maxDistance: 7,
            count: 50
        });
    }

    async function harvestCarrot(carrotPos) {
        await bot.pathfinder.goto(new GoalNear(carrotPos.x, carrotPos.y, carrotPos.z, 1));
        await bot.dig(bot.blockAt(carrotPos));
        await replantCarrot(carrotPos);
    }

    async function replantCarrot(carrotPos) {
        const carrotItem = bot.inventory.findInventoryItem(mcData.itemsByName.carrot.id);
        if (carrotItem) {
            await bot.equip(carrotItem, 'hand');
            const blockBelow = bot.blockAt(carrotPos.offset(0, -1, 0));
            if (blockBelow?.name === 'farmland') {
                try {
                    await bot.placeBlock(blockBelow, new Vec3(0, 1, 0), { timeout: 10000 });
                } catch (err) {
                    console.error('Error placing block:', err);
                }
            } else {
                console.log("Cannot plant on this block. Need farmland!");
            }
        } else {
            console.log("Bot don't have any carrots to plant!");
        }
    }

    async function growCarrotWithBoneMeal(carrotPos, boneMealItemId) {
        const boneMealItem = bot.inventory.findInventoryItem(boneMealItemId);
        if (boneMealItem) {
            await bot.pathfinder.goto(new GoalNear(carrotPos.x, carrotPos.y, carrotPos.z, 1));
            await bot.equip(boneMealItem, 'hand');
            await bot.lookAt(carrotPos.offset(0.5, 0.5, 0.5));

            let block = bot.blockAt(carrotPos);
            while (block.metadata < 7) {
                await bot.activateBlock(block);
                await bot.waitForTicks(10);
                const updatedBlock = bot.blockAt(carrotPos);
                if (updatedBlock.metadata === block.metadata) {
                    console.log("Bone meal had no effect. Stopping growth.");
                    break;
                }
                block = updatedBlock;
            }
            console.log("Crop is fully grown.");
        } else {
            console.log("No bone meal available to grow carrots.");
        }
    }

    async function collectDroppedCarrots() {
        bot.chat("Searching for dropped carrots...");
        const carrotItemId = mcData.itemsByName.carrot.id;

        const droppedCarrots = Object.values(bot.entities).filter(entity =>
            entity.displayName === 'Item' && entity.metadata[8]?.itemId === carrotItemId
        );

        if (droppedCarrots.length === 0) {
            bot.chat("No dropped carrots found nearby.");
            return;
        }

        for (const carrot of droppedCarrots) {
            const { x, y, z } = carrot.position;
            const goal = new GoalNear(x, y, z, 1);
            await bot.pathfinder.goto(goal);
            await sleep(500);
        }

        bot.chat("Collected all nearby dropped carrots.");
    }

    async function storeCarrots() {
        const chestBlockId = mcData.blocksByName.chest.id;
        const chestPos = findNearestBlock(chestBlockId);

        if (!chestPos) {
            bot.chat("No nearby chest found to store carrots.");
            return;
        }

        await bot.pathfinder.goto(new GoalNear(chestPos.x, chestPos.y, chestPos.z, 1));
        const chest = await bot.openChest(bot.blockAt(chestPos));
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

    async function manageCarrotsAndCompost(amount) {
        const chestBlockId = mcData.blocksByName.chest.id;
        const chestPos = findNearestBlock(chestBlockId);

        if (!chestPos) {
            bot.chat("No nearby chest found to retrieve carrots.");
            return;
        }

        await bot.pathfinder.goto(new GoalNear(chestPos.x, chestPos.y, chestPos.z, 1));
        const chest = await bot.openContainer(bot.blockAt(chestPos));
        const carrotItems = chest.containerItems().filter(item => item.name === 'carrot');

        const totalCarrotsInChest = carrotItems.reduce((sum, item) => sum + item.count, 0);

        if (totalCarrotsInChest < amount) {
            bot.chat(`Not enough carrots in the chest. Available: ${totalCarrotsInChest}, required: ${amount}.`);
            chest.close();
            return;
        }

        let carrotsToRetrieve = amount;
        for (const carrotItem of carrotItems) {
            if (carrotsToRetrieve <= 0) break;
            const carrotsTaken = Math.min(carrotItem.count, carrotsToRetrieve);
            await chest.withdraw(carrotItem.type, null, carrotsTaken);
            carrotsToRetrieve -= carrotsTaken;
        }

        bot.chat(`Retrieved ${amount} carrots from the chest.`);
        chest.close();

        const carrotItem = bot.inventory.findInventoryItem(mcData.itemsByName.carrot.id, null);
        if (carrotItem) {
            await bot.equip(carrotItem, 'hand');
        } else {
            bot.chat("No carrots found in inventory after retrieval.");
            return;
        }

        const composterBlockId = mcData.blocksByName.composter.id;
        const composterPos = findNearestBlock(composterBlockId);

        if (!composterPos) {
            bot.chat("No nearby composter found to create bone meal.");
            return;
        }

        await bot.pathfinder.goto(new GoalNear(composterPos.x, composterPos.y, composterPos.z, 1));
        await bot.lookAt(composterPos.offset(0.5, 0.5, 0.5));

        for (let i = 0; i < amount; i++) {
            await bot.activateBlock(bot.blockAt(composterPos));
            await sleep(1000);
        }

        bot.chat(`Added ${amount} carrots to the composter.`);
    }

    function findNearestBlock(blockId) {
        const positions = bot.findBlocks({
            matching: blockId,
            maxDistance: 9,
            count: 1
        });
        return positions.length ? positions[0] : null;
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
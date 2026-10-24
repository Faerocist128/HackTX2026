package assignment;
import java.io.*;
import java.util.*;

public class GameTest {
    public static int SIZE = 4;
    public static int NUM_PLAYERS = 2;
    public static String CUBE_FILE = "./prog5/cubes.txt";
    public static String WORD_FILE = "./prog5/words.txt";
    public static BoggleDictionary VOCAB;

    public static void main(String[] args) {
        VOCAB = new GameDictionary();
        GameManager g = new GameManager();

        try {
            VOCAB.loadDictionary(WORD_FILE);
            g.newGame(SIZE, NUM_PLAYERS, CUBE_FILE, VOCAB);

        }
        catch (IOException e) {
            System.err.println("Cube file not found");
            System.exit(1);
        }

        System.out.println("Board: ");
        for (char[] c : g.board) {
            System.out.println(Arrays.toString(c));
        }
        System.out.println();

        System.out.println("Does boardPaths contain each character on the board (true/false with contains)?:");
        for (char[] row : g.board) {
            for (char c : row) {
                System.out.print("(" + c + ", " +
                        g.boardPaths.contains(c + "") + ") ");
            }
            System.out.println();
        }

        System.out.println("Contains UL corner?: " + g.boardPaths.contains(g.board[0][0]+""));

        System.out.println("First row in boardPaths?: " + g.boardPaths.contains(new String(g.board[0])));
        System.out.println("Second row in boardPaths?: " + g.boardPaths.contains(new String(g.board[1])));
        System.out.println("Third row in boardPaths?: " + g.boardPaths.contains(new String(g.board[2])));
        System.out.println("Fourth row in boardPaths?: " + g.boardPaths.contains(new String(g.board[3])));
        System.out.println("UL->BR Diagonal in boardPaths?: " +
                g.boardPaths.contains("" + g.board[0][0] + g.board[1][1] +
                        g.board[2][2] + g.board[3][3])
        );
        System.out.println("BR->UL Diagonal in boardPaths?: " +
                g.boardPaths.contains("" + g.board[3][3] + g.board[2][2] +
                        g.board[1][1] + g.board[0][0])
        );
        System.out.println("BL->UR Diagonal in boardPaths?: " +
                g.boardPaths.contains("" + g.board[0][3] + g.board[1][2] +
                        g.board[2][1] + g.board[3][0])
        );
        System.out.println("UR->BL Diagonal in boardPaths?: " +
                g.boardPaths.contains("" + g.board[3][0] + g.board[2][1] +
                        g.board[1][2] + g.board[0][3])
        );
        System.out.println("Invalid overlap in boardPaths?: " +
                g.boardPaths.contains("" + g.board[0][0] + g.board[0][1] +
                        g.board[1][0] + g.board[0][0])
        );

        System.out.println("aardvark in vocab?: " + g.vocab.contains("aardvark"));

        String row = "" + g.board[0][0] + g.board[0][1] + g.board[0][2] + g.board[0][3];
        System.out.println(g.boardPaths.lookup(row, 0));

        System.out.println("Contains UL followed by BR corner?: " +
                g.boardPaths.contains(g.board[0][0] + "" + g.board[g.size-1][g.size-1]));

        // aardvark, awesome, elk, and other stuff
        char[][] testBoard = new char[][]{
                {'A','A','R','D'},
                {'W','E','S','V'},
                {'E','M','O','A'},
                {'E','L','K','R'},
        };
        g.setGame(testBoard);
        // g.initPaths();

        System.out.println("aardvark:");
        System.out.println(g.addWord("aardvark", 0));
        System.out.println(g.getLastAddedWord().toString());
        System.out.println("awesome:");
        System.out.println(g.addWord("awesome", 0));
        System.out.println(g.getLastAddedWord().toString());
        System.out.println("elk:");
        System.out.println(g.addWord("elk", 1));
        System.out.println(g.getLastAddedWord().toString());
        System.out.println("wears:");
        System.out.println(g.addWord("wears", 1));
        System.out.println(g.getLastAddedWord().toString());
        System.out.println("Final scores: ");
        System.out.println(Arrays.toString(g.getScores()));
    }
}
